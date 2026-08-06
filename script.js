const form = document.querySelector('#lead-form');
const message = document.querySelector('#form-message');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  message.textContent = 'Gracias. Esta versión de prueba registra la consulta localmente; la conexión segura con el equipo se activará en la siguiente fase.';
  form.reset();
});
