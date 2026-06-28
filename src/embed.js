(function () {
    'use strict';

    function buildEmbedUrl(vid, si) {
        var url = 'https://www.youtube.com/embed/' + vid + '?autoplay=1&rel=0';
        if (si) {
            url += '&si=' + si;
        }
        return url;
    }


    // Render the static overlay inside the container
    function renderOverlay(container, vid, title, duration) {
        // Thumbnail — try maxresdefault, fall back to hqdefault on error
        var img = document.createElement('img');
        img.className = 'yt-embed__thumb';
        img.alt = title || 'YouTube video';
        img.loading = 'lazy';
        img.decoding = 'async';

        // Progressive thumb fallback
        var sizeIndex = 0;
        img.src = img.src = 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg';

        // Gradient
        var gradient = document.createElement('div');
        gradient.className = 'yt-embed__gradient';

        // Play button (YouTube-style)
        var playBtn = document.createElement('div');
        playBtn.className = 'yt-embed__play';
        playBtn.setAttribute('aria-label', 'Play' + (title ? ': ' + title : ''));
        playBtn.setAttribute('role', 'button');
        playBtn.setAttribute('tabindex', '0');
        playBtn.innerHTML =
            '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<polygon points="5,3 19,12 5,21"/>' +
            '</svg>';

        container.appendChild(img);
        container.appendChild(gradient);
        container.appendChild(playBtn);

        // Optional title
        if (title) {
            var titleEl = document.createElement('div');
            titleEl.className = 'yt-embed__title';
            titleEl.textContent = title;
            container.appendChild(titleEl);
        }

        // Optional duration badge (shown bottom-right; hide if title overlaps)
        if (duration && !title) {
            var durEl = document.createElement('div');
            durEl.className = 'yt-embed__duration';
            durEl.textContent = duration;
            container.appendChild(durEl);
        }
    }

    // Replace overlay with the live iframe
    function activateEmbed(container, vid) {
        container.classList.add('yt-embed--loading');

        var iframe = document.createElement('iframe');
        iframe.src = buildEmbedUrl(vid);
        iframe.allow =
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.title = container.dataset.title || 'YouTube video player';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.setAttribute('allow',
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.onload = function () {
            // remove overlay elements only, iframe is already in the DOM
            container.querySelectorAll('.yt-embed__thumb, .yt-embed__gradient, .yt-embed__play, .yt-embed__title, .yt-embed__duration')
                .forEach(function (el) { el.remove(); });
            container.classList.remove('yt-embed--loading');
            container.onclick = null;
            container.onkeydown = null;
        };
        // append iframe AFTER setting onload
        container.appendChild(iframe);

        container.appendChild(iframe);
    }

    // Initialise all .yt-embed containers on the page
    function init() {
        var containers = document.querySelectorAll('.yt-embed');
        containers.forEach(function (container) {
            var vid = container.dataset.vid;
            if (!vid) return; // skip if no video ID

            var title = container.dataset.title || '';
            var duration = container.dataset.duration || '';

            renderOverlay(container, vid, title, duration);

            // Click to activate
            container.addEventListener('click', function () {
                activateEmbed(container, vid);
            });

            // Keyboard: Enter or Space
            container.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateEmbed(container, vid);
                }
            });

            // Make container focusable
            if (!container.getAttribute('tabindex')) {
                container.setAttribute('tabindex', '0');
            }
            container.setAttribute('role', 'button');
            container.setAttribute('aria-label', 'Play video' + (title ? ': ' + title : ''));
        });
    }

    // Run after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();