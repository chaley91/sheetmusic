// Sheet music renderer - abcjs wrapper

export function renderABC(elementId, abcNotation, options = {}) {
  if (typeof ABCJS === 'undefined') {
    console.error('abcjs not loaded');
    return null;
  }

  const defaults = {
    responsive: 'resize',
    staffwidth: 800,
    wrap: {
      minSpacing: 1.5,
      maxSpacing: 2.7,
      preferredMeasuresPerLine: 4
    },
    paddingtop: 10,
    paddingbottom: 20,
    paddingleft: 10,
    paddingright: 10
  };

  const renderOptions = { ...defaults, ...options };

  try {
    const tuneObject = ABCJS.renderAbc(elementId, abcNotation, renderOptions);
    return tuneObject;
  } catch (err) {
    console.error('ABC render error:', err);
    return null;
  }
}

export function validateABC(abcNotation) {
  if (typeof ABCJS === 'undefined') {
    return { valid: false, errors: ['abcjs not loaded'] };
  }

  try {
    const tune = ABCJS.parseOnly(abcNotation);
    const warnings = [];

    if (tune && tune.length > 0 && tune[0].warnings) {
      tune[0].warnings.forEach(w => warnings.push(w));
    }

    return {
      valid: warnings.length === 0,
      warnings,
      tune: tune && tune.length > 0 ? tune[0] : null
    };
  } catch (err) {
    return { valid: false, errors: [err.message] };
  }
}

export function clearRender(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.innerHTML = '';
}
