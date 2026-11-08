import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE=':memory:';
const db=await import('../db.js'),auth=await import('../auth.js');after(()=>db.closeDb());
test('new credentials are persisted as a hash and allow later sign-in, including case-insensitive login',async()=>{
 const credentials={login:'RegistrationFixture',password:'fixture-only-pass'};
 assert.equal((await auth.login(credentials)).status,401);
 const created=await auth.register(credentials);assert.equal(created.status,200);assert.ok(created.body.token);
 const stored=db.getUserByLogin(credentials.login);assert.ok(stored);assert.notEqual(stored.pass_hash,credentials.password);
 assert.equal((await auth.login(credentials)).status,200);
 assert.equal((await auth.login({...credentials,login:credentials.login.toLowerCase()})).status,200);
 assert.equal((await auth.login({...credentials,password:'incorrect'})).status,401);
 assert.equal((await auth.register(credentials)).status,409);
});
