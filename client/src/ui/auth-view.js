export function loginView(preview,register=false) {
  return `<main class="login-screen">
    <div class="title-block"><span class="quill-title">За горизонтом</span><h1><span class="title-word">Открытие</span>1492</h1><div class="title-rule"><i></i></div><span class="title-seal">Часть первая</span></div>
    <form id="login-form" class="login-form">
      <h2>${preview?'Проверка интерфейса':register?'Создать аккаунт':'Вход'}</h2>
      <label for="login-name">Имя</label><input id="login-name" name="login" autocomplete="username" minlength="3" maxlength="20" required>
      <label for="login-password">Пароль</label><input id="login-password" type="password" name="password" autocomplete="${register?'new-password':'current-password'}" minlength="4" maxlength="100" required>
      ${register?'<label for="register-confirm">Повторите пароль</label><input id="register-confirm" type="password" autocomplete="new-password" minlength="4" maxlength="100" required>':''}
      <p id="login-status" role="status"></p>
      <p id="login-error" class="error" role="alert"></p>
      <button class="primary" id="login-submit">${preview?'Продолжить':register?'Зарегистрироваться':'Войти'}</button>
      ${preview?'':`<button type="button" id="register" class="quiet-button">${register?'Уже есть аккаунт — войти':'Создать аккаунт'}</button>`}
    </form>
    <footer class="login-footer">${preview?'<a href="/">Вход на сервер</a>':'<a href="/?offline=1">Проверка UI</a>'}</footer>
  </main>`;
}

