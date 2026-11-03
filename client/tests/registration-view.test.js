import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loginView} from '../src/ui/auth-view.js';
test('registration has its own form, confirmation and new-password autocomplete; login remains separate',()=>{
 const login=loginView(false),register=loginView(false,true);
 assert.ok(login.includes('type="button" id="register"'));assert.ok(!login.includes('id="register-confirm"'));
 assert.ok(register.includes('id="register-confirm"'));assert.ok(register.includes('Зарегистрироваться'));assert.ok(register.includes('new-password'));assert.ok(register.includes('Уже есть аккаунт'));
});
