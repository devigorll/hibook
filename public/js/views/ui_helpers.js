// Auxiliares de interface compartilhados pelas views.

// Mostra (ou limpa, com texto vazio) uma mensagem em um elemento .form-message.
// tone: 'success' | 'error'. As demais classes do elemento são preservadas.
export function setMessage(element, text, tone = 'success') {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.classList.add('form-message');
  element.classList.toggle('error-text', Boolean(text) && tone === 'error');
  element.classList.toggle('success-text', Boolean(text) && tone !== 'error');
}

// Roda uma tarefa com o botão desativado (evita envio duplicado) e, se houver busyLabel,
// com o texto do <span> do botão trocado enquanto espera. Restaura tudo ao final.
export async function withBusyButton(button, busyLabel, task) {
  const label = busyLabel ? button.querySelector('span') : null;
  const originalText = label?.textContent;

  button.disabled = true;

  if (label) {
    label.textContent = busyLabel;
  }

  try {
    return await task();
  } finally {
    button.disabled = false;

    if (label) {
      label.textContent = originalText;
    }
  }
}
