/* ==========================================================================
   KeerthiWIKI – renders data.json as a Wikipedia-style article.

   Content macros you can use inside any "content" / "lead" string:
     {{image:images/photo.jpg|Caption text|right|300}}   (align: left | right | center, width in px optional)
     {{video:https://.../clip.mp4|Caption text|left}}
     {{ref:id}}                                            (id of an entry in "references")
   Sections may also have  "gallery": [{ "src": "...", "caption": "..." }, { "video": "...", "caption": "..." }]
   and  "subsections": [ ...same shape as a section... ]
   ========================================================================== */
(function () {
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plain = (html) => {
        const t = document.createElement('template');
        t.innerHTML = html;
        return (t.content.textContent || '').replace(/\s+/g, ' ').trim();
    };

    /* ---------- Theme / sidebar (work even if data fails to load) ---------- */
    const root = document.documentElement;
    $('#themeToggle').addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
    });

    const desktop = window.matchMedia('(min-width: 1000px)');
    const closeDrawer = () => document.body.classList.remove('drawer-open');
    $('#menuToggle').addEventListener('click', () => {
        if (desktop.matches) document.body.classList.toggle('toc-collapsed');
        else document.body.classList.toggle('drawer-open');
    });
    $('#sidebarOverlay').addEventListener('click', closeDrawer);
    desktop.addEventListener('change', closeDrawer);

    /* ---------- Profiles dropdown (article tab row) ---------- */
    const pBtn = $('#profilesBtn'), pMenu = $('#profilesMenu');
    const setProfiles = (open) => { pMenu.hidden = !open; pBtn.setAttribute('aria-expanded', String(open)); };
    pBtn.addEventListener('click', (e) => { e.stopPropagation(); setProfiles(pMenu.hidden); });
    document.addEventListener('click', (e) => { if (!pMenu.hidden && !pMenu.contains(e.target)) setProfiles(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pMenu.hidden) { setProfiles(false); pBtn.focus(); } });

    /* ---------- Placeholder for missing profile image ---------- */
    const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#c8ccd1"/>' +
        '<circle cx="60" cy="46" r="20" fill="#72777d"/><path d="M20 120c0-26 18-42 40-42s40 16 40 42z" fill="#72777d"/></svg>');

    /* ---------- Load ---------- */
    fetch('data.json', { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(init)
        .catch((err) => {
            console.error('KeerthiWIKI failed to load:', err);
            const msg = $('#loadingMsg');
            if (msg) {
                msg.innerHTML = 'Could not load <code>data.json</code>. If you opened <code>index.html</code> directly from your files, ' +
                    'run a small local server instead (for example <code>npx serve</code> or VS Code Live Server).';
            }
        });

    function init(data) {
        const info = data.infobox || {};
        const searchIndex = [];

        /* ----- citations ----- */
        const refDefs = {};
        (data.references || []).forEach((r) => { refDefs[r.id] = r; });
        const refOrder = [];
        const refUses = {};

        function cite(id) {
            if (!refDefs[id]) return '<sup class="cite-error">[unknown reference: ' + esc(id) + ']</sup>';
            if (!refUses[id]) { refUses[id] = 0; refOrder.push(id); }
            const n = refOrder.indexOf(id) + 1;
            const k = ++refUses[id];
            return '<sup class="reference" id="cite_ref-' + id + '-' + k + '"><a href="#cite_note-' + id + '">[' + n + ']</a></sup>';
        }

        /* ----- media ----- */
        function mediaTag(type, src, alt) {
            if (type === 'video') {
                const mime = /\.webm($|\?)/i.test(src) ? 'video/webm' : 'video/mp4';
                return '<div class="video-wrap"><video controls muted loop playsinline preload="metadata"><source src="' + esc(src) + '" type="' + mime + '"></video>' +
                    '<button type="button" class="video-expand" aria-label="View video larger" title="View larger">&#10530;</button></div>';
            }
            return '<img class="lightbox-img" src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy">';
        }

        function figure(type, src, caption, align, width) {
            const cls = align === 'left' ? 'tleft' : align === 'center' ? 'tcenter' : 'tright';
            const style = width ? ' style="width:' + (parseInt(width, 10) + 8) + 'px"' : '';
            return '<figure class="thumb ' + cls + '"' + style + '><div class="thumbinner">' +
                mediaTag(type, src, plain(caption)) + '<figcaption>' + caption + '</figcaption></div></figure>';
        }

        function expand(html) {
            return String(html || '')
                .replace(/\{\{\s*(image|video)\s*:\s*([^|}]+?)\s*\|([^|}]*)(?:\|\s*(left|right|center))?(?:\|\s*(\d+))?\s*\}\}/g,
                    (m, type, src, cap, align, w) => figure(type, src, cap.trim(), align || 'right', w))
                .replace(/\{\{\s*ref\s*:\s*([\w-]+)\s*\}\}/g, (m, id) => cite(id));
        }

        function galleryHtml(items) {
            if (!items || !items.length) return '';
            return '<ul class="gallery">' + items.map((it) => {
                const cap = expand(it.caption || '');
                const media = it.video ? mediaTag('video', it.video, '') : mediaTag('image', it.src, plain(cap));
                return '<li class="gallerybox"><div class="thumbinner">' + media + '<div class="gallerytext">' + cap + '</div></div></li>';
            }).join('') + '</ul>';
        }

        /* ----- sections ----- */
        function renderSection(s, level) {
            const tag = 'h' + level;
            let html = '<div class="mw-heading mw-heading' + level + '"><' + tag + ' id="' + esc(s.id) + '">' + s.title + '</' + tag + '></div>';
            const body = expand(s.content) + galleryHtml(s.gallery);
            // Wrap each section's own content so its floated media can be kept inside it (see containMedia)
            if (body.trim()) {
                const media = /class="thumb|class="gallery/.test(body);
                html += '<div class="mw-section-body' + (media ? ' has-media' : '') + '" data-section="' + esc(s.id) + '">' + body + '</div>';
            }
            searchIndex.push({ id: s.id, title: plain(s.title), text: plain(body) });
            (s.subsections || []).forEach((sub) => { html += renderSection(sub, level + 1); });
            return html;
        }

        /* ----- infobox ----- */
        function ageFrom(iso) {
            const d = new Date(iso), n = new Date();
            let a = n.getFullYear() - d.getFullYear();
            const m = n.getMonth() - d.getMonth();
            if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
            return a;
        }

        function infoboxHtml() {
            let h = '<table class="infobox infobox-biography"><caption class="infobox-title">' + esc(info.name || '') + '</caption><tbody>';
            if (info.image) {
                h += '<tr><td colspan="2" class="infobox-image"><img id="infoImg" class="lightbox-img" src="' + esc(info.image) + '" alt="' + esc(info.name || '') + '">' +
                    (info.caption ? '<div class="infobox-caption">' + info.caption + '</div>' : '') + '</td></tr>';
            }
            (info.rows || []).forEach((r) => {
                if (r.header) {
                    h += '<tr><th colspan="2" class="infobox-header">' + esc(r.header) + '</th></tr>';
                } else {
                    let v = r.value || '';
                    if (r.ageFrom) v += ' (age&nbsp;' + ageFrom(r.ageFrom) + ')';
                    h += '<tr><th scope="row" class="infobox-label">' + esc(r.label) + '</th><td>' + v + '</td></tr>';
                }
            });
            if ((data.medals || []).length) {
                h += '<tr><th colspan="2" class="infobox-header">Medal record</th></tr>';
                h += '<tr><td colspan="2" class="medal-table-cell"><table class="medal-table"><thead><tr>' +
                    '<th class="medal-event-head">Event</th>' +
                    '<th class="mh"><span class="badge badge-g" title="Gold">G</span></th>' +
                    '<th class="mh"><span class="badge badge-s" title="Silver">S</span></th>' +
                    '<th class="mh"><span class="badge badge-b" title="Bronze">B</span></th>' +
                    '</tr></thead><tbody>';
                data.medals.forEach((m) => {
                    const label = esc(m.event);
                    const ev = m.href ? '<a href="' + esc(m.href) + '">' + label + '</a>' : label;
                    h += '<tr><td class="medal-event">' + ev + (m.year ? ' <span class="medal-year">(' + esc(m.year) + ')</span>' : '') + '</td>' +
                        '<td class="mc mc-g">' + (m.g || 0) + '</td><td class="mc mc-s">' + (m.s || 0) + '</td><td class="mc mc-b">' + (m.b || 0) + '</td></tr>';
                });
                h += '</tbody></table></td></tr>';
            }
            return h + '</tbody></table>';
        }

        /* ----- build article ----- */
        const mainSecs = (data.sections || []).filter((s) => !s.afterReferences);
        const tailSecs = (data.sections || []).filter((s) => s.afterReferences);

        const leadHtml = '<div id="lead">' + expand(data.lead) + '</div>';
        searchIndex.push({ id: 'firstHeading', title: info.name || 'Top', text: plain(leadHtml) });

        const mainHtml = mainSecs.map((s) => renderSection(s, 2)).join('');
        const tailHtml = tailSecs.map((s) => renderSection(s, 2)).join('');

        // References (built after every {{ref}} has been counted)
        let refsHtml = '';
        const allRefIds = refOrder.concat(Object.keys(refDefs).filter((id) => !refOrder.includes(id)));
        if (allRefIds.length) {
            refsHtml = '<div class="mw-heading mw-heading2"><h2 id="references">References</h2></div><ol class="references">' +
                allRefIds.map((id) => {
                    const uses = refUses[id] || 0;
                    let back = '';
                    if (uses === 1) back = '<span class="mw-cite-backlink"><a href="#cite_ref-' + id + '-1">^</a></span>';
                    else if (uses > 1) {
                        back = '<span class="mw-cite-backlink">^ ' + Array.from({ length: uses }, (_, i) =>
                            '<a href="#cite_ref-' + id + '-' + (i + 1) + '"><sup>' + String.fromCharCode(97 + i) + '</sup></a>').join(' ') + '</span>';
                    }
                    return '<li id="cite_note-' + id + '">' + back + '<span class="reference-text">' + refDefs[id].html + '</span></li>';
                }).join('') + '</ol>';
            searchIndex.push({ id: 'references', title: 'References', text: plain(refsHtml) });
        }

        // Search entries for tail sections were pushed before references; order doesn't matter.
        $('#bodyContent').innerHTML = infoboxHtml() + leadHtml + mainHtml + refsHtml + tailHtml;

        /* ----- title, categories, footer ----- */
        document.title = 'KeerthiWIKI';
        $('#firstHeading').textContent = info.name || '';

        if (data.lastEdited) {
            const d = new Date(data.lastEdited + 'T00:00:00');
            if (!isNaN(d)) {
                $('#footerEdited').textContent = 'This page was last edited on ' +
                    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '.';
            }
        }

        /* ----- a figure whose image file is missing (e.g. not yet added to /images) is hidden, not shown broken ----- */
        $$('figure.thumb img').forEach((im) => im.addEventListener('error', () => {
            const f = im.closest('figure'); if (f) f.remove();
        }, { once: true }));

        /* ----- label table cells so tables can stack on narrow screens ----- */
        $$('table.wikitable').forEach((t) => {
            const heads = $$('thead th', t).map((th) => th.textContent.trim());
            $$('tbody tr', t).forEach((tr) => $$('td', tr).forEach((td, i) => { if (heads[i]) td.setAttribute('data-label', heads[i]); }));
        });

        /* ----- external links open safely in new tab ----- */
        $$('a[target="_blank"]').forEach((a) => { a.rel = 'noopener noreferrer'; });

        /* ----- profile image fallback ----- */
        const img = $('#infoImg');
        if (img) {
            img.addEventListener('error', () => {
                img.src = PLACEHOLDER;
                img.classList.add('placeholder');
                img.classList.remove('lightbox-img');
            }, { once: true });
        }

        buildToc(mainSecs, !!refsHtml, tailSecs);
        setupSearch(searchIndex);

        // Jump to a #hash that existed before content was rendered
        if (location.hash.length > 1) {
            const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
            if (el) el.scrollIntoView();
        }
    }

    /* ======================================================================
       TABLE OF CONTENTS (with collapsible subsections and scroll-spy)
       ====================================================================== */
    function buildToc(mainSecs, hasRefs, tailSecs) {
        const list = $('#toc-list');
        const CHEVRON = '<svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M7 3l8 7-8 7z"/></svg>';

        function item(s) {
            const subs = s.subsections || [];
            const li = document.createElement('li');
            li.className = 'toc-item';
            li.innerHTML = '<div class="toc-row">' +
                (subs.length ? '<button type="button" class="toc-toggle" aria-label="Toggle ' + esc(plain(s.title)) + ' subsections">' + CHEVRON + '</button>' : '<span class="toc-spacer"></span>') +
                '<a href="#' + esc(s.id) + '" data-target="' + esc(s.id) + '">' + s.title + '</a></div>';
            if (subs.length) {
                const ul = document.createElement('ul');
                ul.className = 'toc-sub';
                subs.forEach((sub) => ul.appendChild(item(sub)));
                li.appendChild(ul);
                $('.toc-toggle', li).addEventListener('click', () => li.classList.toggle('expanded'));
            }
            return li;
        }

        const top = document.createElement('li');
        top.className = 'toc-item toc-top';
        top.innerHTML = '<div class="toc-row"><span class="toc-spacer"></span><a href="#firstHeading" data-target="firstHeading">(Top)</a></div>';
        list.appendChild(top);

        mainSecs.forEach((s) => list.appendChild(item(s)));
        if (hasRefs) list.appendChild(item({ id: 'references', title: 'References' }));
        tailSecs.forEach((s) => list.appendChild(item(s)));

        // close mobile drawer after choosing a link
        list.addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('drawer-open'); });

        /* scroll-spy */
        const links = $$('a[data-target]', list);
        const targets = links.map((a) => document.getElementById(a.dataset.target)).filter(Boolean);
        let ticking = false;

        function update() {
            ticking = false;
            const line = 110;
            let current = targets[0];
            for (const el of targets) {
                if (el.getBoundingClientRect().top <= line) current = el; else break;
            }
            // reached bottom → last item
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = targets[targets.length - 1];

            links.forEach((a) => a.classList.toggle('toc-active', a.dataset.target === (current && current.id)));
            const active = links.find((a) => a.classList.contains('toc-active'));
            if (active) {
                // expand ancestors of the active entry
                let p = active.closest('.toc-item');
                while (p) {
                    p.classList.add('expanded');
                    p = p.parentElement && p.parentElement.closest('.toc-item');
                }
            }
        }
        window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
        window.addEventListener('resize', update);
        update();
    }

    /* ======================================================================
       SEARCH
       ====================================================================== */
    function setupSearch(index) {
        const form = $('#searchForm');
        const input = $('#searchInput');
        const box = $('#searchResults');
        let results = [];
        let active = -1;

        const hl = (text, terms) => {
            const safe = esc(text);
            if (!terms.length) return safe;
            return safe.replace(new RegExp('(' + terms.map((t) => escRe(esc(t))).join('|') + ')', 'gi'), '<mark>$1</mark>');
        };

        function run(q) {
            const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
            if (!terms.length) return { terms, hits: [] };
            const hits = [];
            index.forEach((e) => {
                const t = e.title.toLowerCase(), b = e.text.toLowerCase();
                if (!terms.every((w) => t.includes(w) || b.includes(w))) return;
                let score = 0;
                terms.forEach((w) => {
                    if (t.includes(w)) score += 10;
                    score += Math.min(5, b.split(w).length - 1);
                });
                const i = b.indexOf(terms.find((w) => b.includes(w)) || '');
                const start = Math.max(0, i - 50);
                const snippet = (start > 0 ? '… ' : '') + e.text.slice(start, start + 150) + (start + 150 < e.text.length ? ' …' : '');
                hits.push({ id: e.id, title: e.title, snippet, score });
            });
            hits.sort((a, b) => b.score - a.score);
            return { terms, hits: hits.slice(0, 7) };
        }

        function open() { box.hidden = false; input.setAttribute('aria-expanded', 'true'); }
        function close() { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }

        function render() {
            const q = input.value.trim();
            if (!q) { close(); return; }
            const { terms, hits } = run(q);
            results = hits;
            active = hits.length ? 0 : -1;
            box.innerHTML = hits.length
                ? hits.map((h, i) => '<li role="option" class="' + (i === 0 ? 'active' : '') + '"><a href="#' + esc(h.id) + '" data-id="' + esc(h.id) + '">' +
                    '<span class="sr-title">' + hl(h.title, terms) + '</span><span class="sr-snippet">' + hl(h.snippet, terms) + '</span></a></li>').join('')
                : '<li class="sr-empty">No results for “' + esc(q) + '”.</li>';
            open();
        }

        function go(id) {
            const el = document.getElementById(id);
            close();
            input.blur();
            if (!el) return;
            history.replaceState(null, '', '#' + id);
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.remove('flash');
            void el.offsetWidth; // restart animation
            el.classList.add('flash');
        }

        function setActive(n) {
            const items = $$('li', box);
            if (!items.length || !results.length) return;
            active = (n + results.length) % results.length;
            items.forEach((li, i) => li.classList.toggle('active', i === active));
            items[active].scrollIntoView({ block: 'nearest' });
        }

        input.addEventListener('input', render);
        input.addEventListener('focus', () => { if (input.value.trim()) render(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
            else if (e.key === 'Escape') { close(); input.blur(); }
        });
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!input.value.trim()) return;
            if (box.hidden) render();
            if (results[active]) go(results[active].id);
        });
        box.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus so click registers
        box.addEventListener('click', (e) => {
            const a = e.target.closest('a[data-id]');
            if (!a) return;
            e.preventDefault();
            go(a.dataset.id);
        });
        document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
        document.addEventListener('keydown', (e) => {
            const tag = (e.target.tagName || '').toLowerCase();
            if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && !e.target.isContentEditable) {
                e.preventDefault();
                input.focus();
                input.select();
            }
        });
    }

    /* ======================================================================
       IMAGE VIEWER (click any article image; browse every image on the page,
       in reading order, like Wikipedia's media viewer)
       ====================================================================== */
    const oldLightbox = $('#lightbox');
    if (oldLightbox) oldLightbox.hidden = true;

    const viewer = document.createElement('div');
    viewer.className = 'viewer';
    viewer.hidden = true;
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'Image viewer');
    viewer.innerHTML =
        '<button type="button" class="viewer-btn viewer-close" aria-label="Close">&times;</button>' +
        '<button type="button" class="viewer-btn viewer-prev" aria-label="Previous image">&#8249;</button>' +
        '<button type="button" class="viewer-btn viewer-next" aria-label="Next image">&#8250;</button>' +
        '<figure class="viewer-figure"><img class="viewer-img" alt=""><video class="viewer-video" controls playsinline loop></video>' +
        '<figcaption><span class="viewer-caption"></span><span class="viewer-count"></span></figcaption></figure>';
    document.body.appendChild(viewer);

    const vImg = $('.viewer-img', viewer), vVid = $('.viewer-video', viewer), vCap = $('.viewer-caption', viewer), vCount = $('.viewer-count', viewer);
    const vPrev = $('.viewer-prev', viewer), vNext = $('.viewer-next', viewer), vClose = $('.viewer-close', viewer);
    let vList = [], vIndex = 0, vReturnFocus = null;

    function captionOf(el) {
        const holder = el.closest('figure, .gallerybox, .infobox-image');
        const cap = holder && holder.querySelector('figcaption, .gallerytext, .infobox-caption');
        return (cap ? cap.textContent : el.alt || '').trim();
    }

    function stopVideo() { vVid.pause(); vVid.removeAttribute('src'); vVid.load(); }

    function show(i) {
        vIndex = (i + vList.length) % vList.length;
        const el = vList[vIndex];
        if (el.tagName === 'VIDEO') {
            vImg.hidden = true; vImg.removeAttribute('src');
            vVid.hidden = false;
            const srcEl = el.querySelector('source');
            vVid.src = srcEl ? srcEl.src : el.currentSrc;
            vVid.play().catch(() => { /* autoplay blocked: user can press play */ });
        } else {
            stopVideo(); vVid.hidden = true;
            vImg.hidden = false;
            vImg.src = el.currentSrc || el.src;
            vImg.alt = el.alt;
        }
        vCap.textContent = captionOf(el);
        vCount.textContent = vList.length > 1 ? (vIndex + 1) + ' / ' + vList.length : '';
        const many = vList.length > 1;
        vPrev.hidden = vNext.hidden = !many;
        if (many) {   // warm the cache for neighbouring images
            [vIndex - 1, vIndex + 1].forEach((n) => { const x = vList[(n + vList.length) % vList.length]; if (x.tagName === 'IMG') new Image().src = x.src; });
        }
    }

    function openViewer(el) {
        // every image and video in the article, in document order
        vList = $$('#bodyContent img.lightbox-img, #bodyContent .video-wrap video');
        const i = vList.indexOf(el);
        if (i < 0) return;
        $$('#bodyContent video').forEach((v) => v.pause());
        vReturnFocus = document.activeElement;
        viewer.hidden = false;
        document.body.classList.add('viewer-open');
        show(i);
        vClose.focus();
    }

    function closeViewer() {
        if (viewer.hidden) return;
        viewer.hidden = true;
        stopVideo();
        vImg.removeAttribute('src');
        document.body.classList.remove('viewer-open');
        if (vReturnFocus && vReturnFocus.focus) vReturnFocus.focus();
    }

    document.addEventListener('click', (e) => {
        const img = e.target.closest('#bodyContent img.lightbox-img');
        if (img) { openViewer(img); return; }
        const btn = e.target.closest('#bodyContent .video-expand');
        if (btn) openViewer(btn.parentElement.querySelector('video'));
    });
    vPrev.addEventListener('click', (e) => { e.stopPropagation(); show(vIndex - 1); });
    vNext.addEventListener('click', (e) => { e.stopPropagation(); show(vIndex + 1); });
    vClose.addEventListener('click', closeViewer);
    viewer.addEventListener('click', (e) => { if (!e.target.closest('.viewer-img, .viewer-video, figcaption, .viewer-btn')) closeViewer(); });

    document.addEventListener('keydown', (e) => {
        if (viewer.hidden) return;
        if (e.key === 'Escape') closeViewer();
        else if (e.key === 'ArrowLeft') { e.preventDefault(); show(vIndex - 1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); show(vIndex + 1); }
        else if (e.key === 'Tab') { // keep focus inside the dialog
            const btns = [vClose, vPrev, vNext].filter((b) => !b.hidden);
            const k = btns.indexOf(document.activeElement);
            e.preventDefault();
            btns[(k + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
        }
    });

    // swipe left/right on touch screens
    let touchX = null;
    viewer.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    viewer.addEventListener('touchend', (e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) > 50 && vList.length > 1) show(vIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
})();