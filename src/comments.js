document.addEventListener('DOMContentLoaded', () => {
  const section = document.querySelector('[data-post]');
  if (!section) { return; }

  const slug = section.dataset.post;
  const sitekey = typeof DEBUG !== 'undefined' ? '' : (section.dataset.sitekey || '');
  const modal = document.getElementById('comment-modal');
  const commentModal = modal.querySelector('.comment-modal');
  const successBox = modal.querySelector('.modal-success-box');
  const modalTitle = modal.querySelector('.modal-title');
  const replyContext = modal.querySelector('.modal-reply-context');
  const replyName = modal.querySelector('.modal-reply-name');
  const replyText = modal.querySelector('.modal-reply-text');
  const form = modal.querySelector('.comment-form');
  const status = form.querySelector('.form-status');
  const parentInput = form.querySelector('[name=parent_id]');

  let turnstileLoaded = false;
  let turnstileWidgetId = null;

  function loadTurnstile() {
    if (!sitekey || window.turnstile) { return Promise.resolve(); }
    return new Promise(resolve => {
      window.onloadTurnstileCallback = resolve;
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit';
      s.async = true;
      document.head.appendChild(s);
    });
  }

  function openModal(replyTo) {
    if (replyTo) {
      modalTitle.textContent = 'Svara ' + replyTo.name;
      replyName.textContent = replyTo.name;
      replyText.textContent = replyTo.text;
      replyContext.hidden = false;
      parentInput.value = replyTo.id;
    } else {
      modalTitle.textContent = 'Lämna en kommentar';
      replyContext.hidden = true;
      parentInput.value = '';
    }

    const afterTurnstile = (sitekey && !turnstileLoaded)
      ? loadTurnstile().then(() => {
          const container = document.getElementById('cf-turnstile-container');
          if (container && window.turnstile) {
            turnstileWidgetId = window.turnstile.render(container, { sitekey, theme: 'light' });
          }
          turnstileLoaded = true;
        })
      : Promise.resolve();

    afterTurnstile.then(() => {
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      form.querySelector('[name=name]').focus();
    });
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    commentModal.hidden = false;
    successBox.hidden = true;
    form.reset();
    status.textContent = '';
    if (sitekey && turnstileWidgetId != null && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  section.querySelector('.open-comment-btn').addEventListener('click', () => openModal(null));

  section.addEventListener('click', e => {
    const btn = e.target.closest('.reply-btn');
    if (!btn) { return; }
    const comment = btn.closest('.comment');
    const name = comment.querySelector('.comment-name').textContent.trim();
    const fullText = comment.querySelector('p').textContent.trim();
    const text = fullText.length > 150 ? fullText.slice(0, 150) + '…' : fullText;
    openModal({ id: comment.id, name, text });
  });

  modal.addEventListener('click', e => {
    if (e.target === modal) { closeModal(); }
  });

  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-success-close').addEventListener('click', closeModal);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) { closeModal(); }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    status.textContent = '';

    const id = 'c-' + Math.random().toString(36).slice(2, 8);
    const turnstileInput = form.querySelector('[name="cf-turnstile-response"]');

    fetch('/api/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        parent_id: parentInput.value || '',
        post: slug,
        name: form.querySelector('[name=name]').value,
        email: form.querySelector('[name=email]').value,
        comment: form.querySelector('[name=comment]').value,
        turnstileToken: turnstileInput ? turnstileInput.value : '',
      }),
    }).then(r => {
      if (r.ok) {
        form.reset();
        if (sitekey && turnstileWidgetId != null && window.turnstile) {
          window.turnstile.reset(turnstileWidgetId);
        }
        commentModal.hidden = true;
        successBox.hidden = false;
      } else {
        status.textContent = 'Något gick fel — försök igen.';
      }
    }).catch(() => {
      status.textContent = 'Kunde inte skicka. Kontrollera anslutningen.';
    }).then(() => {
      submit.disabled = false;
    });
  });
});
