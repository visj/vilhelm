(function () {

    var toastEl = null;

    function toast(msg) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.remove('toast-hide');
        toastEl.classList.add('toast-show');
        clearTimeout(toastEl._timer);
        toastEl._timer = setTimeout(function () {
            toastEl.classList.add('toast-hide');
            toastEl.addEventListener('transitionend', function handler() {
                toastEl.classList.remove('toast-show', 'toast-hide');
                toastEl.removeEventListener('transitionend', handler);
            });
        }, 1800);
    }

    function slugify(text) {
        return text.trim()
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-{2,}/g, '-');
    }

    document.querySelectorAll('h2, h3, h4').forEach(function (h) {
        if (h.closest('.comments')) { return; }
        if (!h.id) {
            h.id = slugify(h.textContent);
        }

        var icon = document.createElement('span');
        icon.className = 'anchor-icon';
        icon.textContent = '§';
        icon.setAttribute('aria-hidden', 'true');
        h.insertBefore(icon, h.firstChild);

        icon.addEventListener('click', function (e) {
            e.stopPropagation();
            if (h.classList.contains('anchor-copied')) { return; }
            var url = location.href.split('#')[0] + '#' + h.id;
            navigator.clipboard.writeText(url).then(function () {
                toast('Link copied');
                icon.textContent = '✓';
                h.classList.add('anchor-copied');
                setTimeout(function () {
                    h.classList.add('anchor-fading');
                    setTimeout(function () {
                        h.classList.remove('anchor-copied', 'anchor-fading');
                        icon.textContent = '§';
                    }, 300);
                }, 500);
            });
        });
    });

    var refPopup = null;
    var activeRef = null;

    function buildRefMap() {
        var map = {};
        var counter = 1;
        document.querySelectorAll('sup.ref[data-ref]').forEach(function (sup) {
            var key = sup.dataset.ref;
            if (!(key in map)) {
                map[key] = counter++;
            }
            var n = map[key];
            sup.textContent = n;
            sup.setAttribute('data-ref-n', n);
        });
        return map;
    }

    function showRefPopup(sup) {
        var key = sup.dataset.ref;
        var li = document.getElementById(key);
        if (!li) { return; }

        if (!refPopup) {
            refPopup = document.createElement('div');
            refPopup.className = 'ref-popup';
            document.body.appendChild(refPopup);
            refPopup.addEventListener('click', function (e) {
                e.stopPropagation();
            });
        }

        // Toggle off if clicking the same ref again
        if (activeRef === sup && refPopup.classList.contains('ref-popup-visible')) {
            hideRefPopup();
            return;
        }
        activeRef = sup;

        refPopup.innerHTML = '';

        var body = document.createElement('div');
        body.className = 'ref-popup-body';
        body.innerHTML = li.innerHTML;
        refPopup.appendChild(body);

        var footer = document.createElement('div');
        footer.className = 'ref-popup-footer';
        var jump = document.createElement('a');
        jump.href = '#references';
        jump.textContent = '→ Läs alla referenser';
        jump.addEventListener('click', hideRefPopup);
        footer.appendChild(jump);
        refPopup.appendChild(footer);

        // Measure off-screen first, then position
        refPopup.style.visibility = 'hidden';
        refPopup.style.display = 'block';
        refPopup.classList.add('ref-popup-visible');

        var rect = sup.getBoundingClientRect();
        var pw = refPopup.offsetWidth;
        var margin = 8;
        var left = rect.left + window.scrollX;
        var top = rect.bottom + window.scrollY + margin;

        // Clamp horizontally
        var maxLeft = window.innerWidth - pw - 16;
        if (left > maxLeft) { left = maxLeft; }
        if (left < 16) { left = 16; }

        refPopup.style.left = left + 'px';
        refPopup.style.top = top + 'px';
        refPopup.style.visibility = '';
    }

    function hideRefPopup() {
        if (refPopup) { refPopup.classList.remove('ref-popup-visible'); }
        activeRef = null;
    }

    function initReferences() {
        var sups = document.querySelectorAll('sup.ref[data-ref]');
        if (!sups.length) { return; }

        buildRefMap();

        sups.forEach(function (sup) {
            sup.addEventListener('click', function (e) {
                e.stopPropagation();
                showRefPopup(sup);
            });
        });

        document.addEventListener('click', hideRefPopup);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { hideRefPopup(); }
        });
    }

    initReferences();

}());

document.addEventListener('DOMContentLoaded', () => {
  const section = document.querySelector('[data-post]');
  if (!section) { return; }

  const slug = section.dataset.post;
  const sitekey = section.dataset.sitekey || '';
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

  let activeToken = '';

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

    status.textContent = 'Förbereder formulär...';
    const submitBtn = form.querySelector('button[type=submit]');
    if (submitBtn) submitBtn.disabled = true;

    // Fetch the signed time-locked token from the API
    fetch(`/api/comment?_cb=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        if (data.token) {
          activeToken = data.token;
          status.textContent = '';
          if (submitBtn) submitBtn.disabled = false;
        } else {
          status.textContent = 'Kunde inte initiera säkerhetstoken.';
        }
      })
      .catch(() => {
        status.textContent = 'Nätverksfel. Kunde inte ladda formuläret.';
      });

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    form.querySelector('[name=name]').focus();
  }

function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    commentModal.hidden = false;
    successBox.hidden = true;
    form.reset();
    status.textContent = '';
    activeToken = ''; // Clear the active token on close
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
        token: activeToken, // Transmit the signed cryptographic token string
      }),
    }).then(r => {
      if (r.ok) {
        form.reset();
        activeToken = '';
        commentModal.hidden = true;
        successBox.hidden = false;
      } else {
        // Capture back-end validation messages (like interacting too fast)
        r.json().then(data => {
          status.textContent = data.error || 'Något gick fel — försök igen.';
        }).catch(() => {
          status.textContent = 'Något gick fel — försök igen.';
        });
      }
    }).catch(() => {
      status.textContent = 'Kunde inte skicka. Kontrollera anslutningen.';
    }).then(() => {
      submit.disabled = false;
    });
  });
});
