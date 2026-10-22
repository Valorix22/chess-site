"""Local operator tools. Run interactively inside the application container."""
import argparse, getpass

parser=argparse.ArgumentParser(description='Gestione locale di Scacchi Club')
sub=parser.add_subparsers(dest='command',required=True)
reset=sub.add_parser('reset-password',help='Reimposta una password e termina tutte le sessioni dell’account')
reset.add_argument('username')
args=parser.parse_args()
if args.command=='reset-password':
    import server
    row=server.db.execute("SELECT id FROM users WHERE name=? AND password!=''",(args.username,)).fetchone()
    if not row: parser.exit(1,'Account non trovato.\n')
    password=getpass.getpass('Nuova password (almeno 10 caratteri): ')
    if len(password)<10 or len(password)>128: parser.exit(1,'Usa da 10 a 128 caratteri.\n')
    if password!=getpass.getpass('Conferma nuova password: '): parser.exit(1,'Le password non coincidono.\n')
    hashed=server.password_hash(password)
    server.db.execute('BEGIN IMMEDIATE')
    try:
        server.db.execute('UPDATE users SET password=? WHERE id=?',(hashed,row['id']))
        server.db.execute('DELETE FROM sessions WHERE user_id=?',(row['id'],))
        server.db.execute('COMMIT')
    except Exception:
        server.db.execute('ROLLBACK');raise
    print('Password aggiornata. Tutte le sessioni dell’account sono state terminate.')
