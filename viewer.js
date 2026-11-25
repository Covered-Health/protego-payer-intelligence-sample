(function () {
  const $ = (id) => document.getElementById(id);
  const D = window.PA_RULES, list = $('list');
  if (!D) {
    list.innerHTML = '<p class="none">Could not load pa_rules.data.js. Run build.py and keep that file next to this page.</p>';
    return;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const src = {};
  D.sources.forEach((s) => { src[s.source_id] = s; });
  const uniq = (xs) => xs.filter((x, i) => xs.indexOf(x) === i);
  const KIND = { plan: 'Plan', setting: 'Setting', payer_order: 'Payer order', provider: 'Provider' };
  const PA = { yes: ['req', 'Required'], conditional: ['dep', 'Depends on the plan'], no: ['', 'Not required'], unknown: ['unk', 'Unknown'] };
  const BASIS = {
    listed: 'The code appears on the cited list',
    absent_from_list: 'The code is absent from the cited list',
    program_statement: 'A program statement for this class of service, with no code-level list'
  };
  const TYPE = { pa_code_list: 'Authorization code list', medical_policy: 'Medical policy', rbm_guideline: 'Imaging guideline', program_page: 'Program page' };

  // A dx entry is one code matched by prefix, or an inclusive range "A-B" compared as text (see meta.dx_matching).
  const ICD = /^[A-Z]\d[0-9AB](\.[0-9A-Z]{1,4})?$/;
  const dxHit = (entry, q) => {
    const e = entry.split('-');
    return e.length === 2 ? e[0] <= q && q.slice(0, e[1].length) <= e[1] : q.indexOf(entry) === 0;
  };
  console.assert(dxHit('M48.00-M48.08', 'M48.061') && dxHit('M54.5', 'M54.50') && !dxHit('M54.5', 'M54.4') && !dxHit('N95.0-N95.9', 'N96.0'), 'dxHit self-check failed');

  const planKey = (r) => r.payer + ' · ' + r.plan;
  const plans = uniq(D.rules.map(planKey));
  const codes = uniq(D.rules.map((r) => r.procedure.code));
  const rules = D.rules.map((r) => {
    const pa = r.prior_auth, inds = r.indications || [];
    const dx = [].concat(...inds.map((i) => (i.dx.policy_listed || []).concat(i.dx.derived || [])));
    const text = [r.rule_id, r.payer, r.plan, r.procedure.code, r.procedure.label, r.procedure.modality, (PA[pa.required] || PA.unknown)[1],
      pa.reviewer, pa.conditions, (pa.exclusions || []).map((e) => e.text).join(' '), r.plan_notes, r.review.notes,
      (src[pa.source_id] || {}).title, dx.join(' ')]
      .concat(...inds.map((i) => [i.label, i.summary, i.note, i.coverage.replace('_', ' '), i.locator, (src[i.source_id] || {}).title,
        i.criteria.prior_treatment, i.criteria.prior_imaging, i.criteria.frequency].concat(i.criteria.other || [])));
    return { r, dx, hay: text.filter(Boolean).join(' \n ').toLowerCase() };
  }).sort((a, b) => codes.indexOf(a.r.procedure.code) - codes.indexOf(b.r.procedure.code) || plans.indexOf(planKey(a.r)) - plans.indexOf(planKey(b.r)));

  const link = (sid) => { const s = src[sid]; return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(sid); };
  const loclink = (c) => { const s = src[c.source_id]; return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">${esc(c.locator)}</a>` : esc(c.locator); };
  const fact = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
  const ageText = (c) => {
    const lo = c.age_min, hi = c.age_max;
    if (lo == null && hi == null) return '';
    return hi == null ? `Age ${lo}+` : lo == null ? `Age up to ${hi}` : `Age ${lo}–${hi}`;
  };

  function indHtml(i, icd) {
    const c = i.criteria || {}, dx = i.dx || {};
    const crit = [ageText(c), c.sex === 'F' ? 'Women' : c.sex === 'M' ? 'Men' : '',
      c.prior_treatment && 'Prior treatment: ' + c.prior_treatment, c.prior_imaging && 'Prior imaging: ' + c.prior_imaging,
      c.frequency && 'Frequency: ' + c.frequency].concat(c.other || []).filter(Boolean);
    const chips = (k, xs) => (xs && xs.length ? `<ul class="chips"><li class="k">${k}</li>${xs.map((x) =>
      `<li class="chip${icd.some((q) => dxHit(x, q) || x.indexOf(q) >= 0) ? ' hit' : ''}">${esc(x)}</li>`).join('')}</ul>` : '');
    return `<div class="ind"><div class="ind-head"><span class="pill ${i.coverage === 'covered' ? 'cov">Covered' : 'not">Not covered'}</span><span>${esc(i.label)}</span></div>
      <p>${esc(i.summary)}</p>${i.note ? `<p class="src">Note: ${esc(i.note)}</p>` : ''}${crit.length ? `<ul class="crit">${crit.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${chips('Diagnosis codes printed by the payer', dx.policy_listed)}${chips('Diagnosis codes mapped from the wording', dx.derived)}
      <p class="src">Source: ${link(i.source_id)}, ${esc(i.locator)}</p></div>`;
  }

  const open = new Set();
  function ruleHtml(r, icd, single) {
    const pa = r.prior_auth, p = PA[pa.required] || PA.unknown, inds = r.indications || [];
    const prog = pa.program_source_id && (pa.program_source_id !== pa.source_id || pa.program_locator !== pa.locator)
      ? `${link(pa.program_source_id)} <span class="loc">${esc(pa.program_locator)}</span>` : '';
    return `<details class="rule" data-id="${esc(r.rule_id)}"${single || open.has(r.rule_id) ? ' open' : ''}>
      <summary><span class="sq ${p[0]}" aria-hidden="true"></span><span class="code">${esc(r.procedure.code)}</span>
        <span class="label">${esc(r.procedure.label)}${inds.length ? `<span class="n">${inds.length} indication${inds.length > 1 ? 's' : ''}</span>` : ''}</span>
        <span class="plan">${esc(planKey(r))}</span><span class="pa">${p[1]}</span><span class="chev" aria-hidden="true"></span></summary>
      <div class="body"><dl class="facts">
        ${fact('Prior authorization', p[1] + (pa.reviewer ? ', reviewed by ' + esc(pa.reviewer) : ''))}
        ${fact('Conditions', esc(pa.conditions))}
        ${fact('Exclusions', (pa.exclusions || []).map((e) => `<b>${KIND[e.kind] || esc(e.kind)}:</b> ${esc(e.text)} <span class="loc">${[e].concat(e.more_sources || []).map(loclink).join('; ')}</span>`).join('<br>'))}
        ${fact('How we know', BASIS[pa.basis] || esc(pa.basis))}
        ${fact('Source', `${link(pa.source_id)} <span class="loc">${esc(pa.locator)}</span>`)}
        ${fact('Program source', prog)}
        ${fact('Condition sources', (pa.condition_sources || []).map((c) => `${link(c.source_id)} <span class="loc">${esc(c.locator)}</span>`).join('<br>'))}
        ${fact('Plan notes', esc(r.plan_notes))}
        ${fact('Review', (r.review.status === 'verified' ? 'Verified' : 'Needs review') + ', checked ' + esc(r.review.checked) + (r.review.notes ? '. ' + esc(r.review.notes) : ''))}
        ${fact('Rule ID', `<span class="mono">${esc(r.rule_id)}</span>`)}
      </dl>
      ${inds.length ? `<div><h3>Coverage criteria</h3>${inds.map((i) => indHtml(i, icd)).join('')}</div>` : '<p class="src">No coverage criteria are recorded for this rule.</p>'}
      </div></details>`;
  }

  const q = $('q'), fPlan = $('f-plan'), fPa = $('f-pa'), fMod = $('f-mod'), fInd = $('f-ind');
  plans.forEach((p) => fPlan.add(new Option(p, p)));
  uniq(D.rules.map((r) => r.procedure.modality)).forEach((m) => fMod.add(new Option(m, m)));

  function render() {
    const toks = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const icd = toks.map((t) => t.toUpperCase()).filter((t) => ICD.test(t));
    const out = rules.filter((x) =>
      (!fPlan.value || planKey(x.r) === fPlan.value) && (!fPa.value || x.r.prior_auth.required === fPa.value) &&
      (!fMod.value || x.r.procedure.modality === fMod.value) && (!fInd.checked || (x.r.indications || []).length) &&
      toks.every((t) => x.hay.indexOf(t) >= 0 || (ICD.test(t.toUpperCase()) && x.dx.some((e) => dxHit(e, t.toUpperCase())))));
    $('count').textContent = `Showing ${out.length} of ${rules.length} rules`;
    list.innerHTML = out.length ? out.map((x) => ruleHtml(x.r, icd, out.length === 1)).join('')
      : '<p class="none">No rules match. Clear the search or a filter.</p>';
  }
  list.addEventListener('toggle', (e) => {
    const id = e.target.dataset && e.target.dataset.id;
    if (id) { if (e.target.open) open.add(id); else open.delete(id); }
  }, true);
  q.addEventListener('input', render);
  [fPlan, fPa, fMod, fInd].forEach((el) => el.addEventListener('change', render));
  $('reset').addEventListener('click', () => { q.value = fPlan.value = fPa.value = fMod.value = ''; fInd.checked = false; open.clear(); render(); q.focus(); });

  $('sub').textContent = `${rules.length} rules · ${plans.length} payer plans · ${codes.length} procedure codes · ${D.sources.length} source documents · data generated ${D.meta.generated}`;
  const sc = D.meta.scope || {};
  $('about').innerHTML = [`Scope: ${sc.state}, ${sc.line_of_business} plans, ${sc.setting}.`, sc.caveat, sc.state_mandates && 'State mandates: ' + sc.state_mandates, sc.indications,
    'Diagnosis codes: ' + D.meta.dx_matching, 'Code selection: ' + (D.meta.code_selection || {}).method]
    .filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('');
  $('src-title').textContent = `Sources (${D.sources.length})`;
  $('sources').innerHTML = D.sources.map((s) => `<li><span>${link(s.source_id)}${s.doc_id ? ' (' + esc(s.doc_id) + ')' : ''}</span>
    <span class="src">${esc(s.publisher)} · ${TYPE[s.type] || esc(s.type)} · ${esc([s.effective_date, s.version].filter(Boolean).join(' / ') || 'no version printed')} · retrieved ${esc(s.retrieved)}</span></li>`).join('');
  render();
})();
