"""Convert a downloaded Supabase backup to D1 data; never write private rows into Git."""
import gzip, hashlib, json, os, re, sqlite3, sys, zipfile
from pathlib import Path


def unescape(value):
    if value == r'\N': return None
    translations = {'b':'\b','f':'\f','n':'\n','r':'\r','t':'\t','v':'\v','\\':'\\'}
    return re.sub(r'\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)', lambda m: chr(int(m[1][1:],16)) if m[1].startswith('x') else chr(int(m[1],8)) if m[1][0] in '01234567' else translations.get(m[1],m[1]),value)


def parse(sql, table):
    found = re.search(r'^COPY public\.'+table+r' \(([^\n]+)\) FROM stdin;\n(.*?)^\\\.$',sql,re.M|re.S)
    if not found: raise ValueError('Missing table '+table)
    columns=[name.strip().strip('"') for name in found[1].split(',')]
    rows=[]
    for line in found[2].splitlines():
        values=[unescape(v) for v in line.split('\t')]
        if len(values)!=len(columns): raise ValueError('Column count mismatch')
        rows.append(dict(zip(columns,values)))
    return columns,rows


def literal(v):
    return 'NULL' if v is None else "'"+str(v).replace("'","''")+"'"


def convert(database,archive,output):
    root=Path(__file__).resolve().parents[1];out=Path(output).resolve()
    if out.is_relative_to(root): raise ValueError('Private export must be outside the repository')
    out.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(out,0o700)
    sql=gzip.decompress(Path(database).read_bytes()).decode('utf8')
    connection=sqlite3.connect(':memory:');connection.execute('PRAGMA foreign_keys=ON')
    connection.executescript((root/'cloudflare/migrations/0001_bookings.sql').read_text())
    statements=[];counts={};tables={}
    for table in ['bookings','booking_photos']:
        columns,rows=parse(sql,table);tables[table]=rows;counts[table]=len(rows)
        allowed={r[1] for r in connection.execute('PRAGMA table_info('+table+')')}
        if set(columns)!=allowed: raise ValueError('Schema changed for '+table)
        cols=','.join('"'+c+'"' for c in columns)
        for row in rows:
            statement='INSERT INTO '+table+' ('+cols+') VALUES ('+','.join(literal(row[c]) for c in columns)+');'
            connection.execute(statement);statements.append(statement)
    seq=re.search(r"SELECT pg_catalog.setval\('public.booking_reference_seq', (\d+), (true|false)\);",sql)
    if not seq: raise ValueError('Reference sequence missing')
    value=int(seq[1])-(seq[2]=='false')
    statements.append('UPDATE booking_sequence SET value='+str(value)+' WHERE id=1;')
    if connection.execute('PRAGMA foreign_key_check').fetchall(): raise ValueError('Broken relationships')
    manifests=[]
    with zipfile.ZipFile(archive) as z:
        if z.testzip(): raise ValueError('Invalid ZIP checksum')
        files={n for n in z.namelist() if not n.endswith('/')}
        expected=set()
        for row in tables['booking_photos']:
            key=row['storage_path']
            if not re.fullmatch(r'[a-f0-9-]{36}/[1-3]-[a-f0-9-]{36}\.(png|jpg|webp)',key): raise ValueError('Unexpected photo path')
            member='xdjajqohyikwnfcqroyy/booking-photos/'+key;expected.add(member)
            blob=z.read(member)
            if len(blob)!=int(row['size_bytes']): raise ValueError('Photo size mismatch')
            target=out/'photos'/key;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);target.write_bytes(blob);os.chmod(target,0o600)
            manifests.append({'key':key,'file':str(target),'mime_type':row['mime_type'],'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()})
        if files!=expected: raise ValueError('Archive objects do not match photo metadata')
    for name,content in [('import.sql','\n'.join(statements)+'\n'),('photos.json',json.dumps(manifests,indent=2)),('summary.json',json.dumps({'counts':counts,'photos_verified':len(manifests),'sequence':value},indent=2))]:
        path=out/name;path.write_text(content);os.chmod(path,0o600)
    print(json.dumps({'counts':counts,'photos_verified':len(manifests),'sequence':value,'validation':'passed'}))


if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:
        assert unescape(r'\N') is None
        assert unescape(r'line\nnext\t\\')=='line\nnext\t\\'
        assert unescape('Cairo القاهرة')=='Cairo القاهرة'
        assert unescape(r'\101\x42')=='AB'
        assert literal("O'Brien")=="'O''Brien'"
        assert parse('COPY public.bookings (id, name) FROM stdin;\na\tJenny\n\\.\n','bookings')[1]==[{'id':'a','name':'Jenny'}]
        print('Parser self-checks passed')
    elif len(sys.argv)==4: convert(*sys.argv[1:])
    else: raise SystemExit('Usage: convert-backup.py database.backup.gz storage.zip PRIVATE_OUTPUT_DIRECTORY')
