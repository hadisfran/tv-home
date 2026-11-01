/* Prayer times (Umm al-Qura method) and the Hijri date, worked out on the TV: no network. ES5 for old webOS. */
(function () {
  var DEG = Math.PI / 180;
  function sin(d) { return Math.sin(d * DEG); }
  function cos(d) { return Math.cos(d * DEG); }
  function tan(d) { return Math.tan(d * DEG); }
  function asin(x) { return Math.asin(x) / DEG; }
  function acos(x) { return Math.acos(x) / DEG; }
  function atan2(y, x) { return Math.atan2(y, x) / DEG; }
  function acot(x) { return Math.atan(1 / x) / DEG; }
  function fix(a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; }

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var a = Math.floor(y / 100), b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
  }

  function sun(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360), e = 23.439 - 0.00000036 * D;
    var ra = fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24);
    return {decl: asin(sin(e) * sin(L)), eqt: q / 15 - ra};
  }

  /** Hours (local solar time) when the sun is `angle` degrees below the horizon, before (ccw) or after noon. */
  function at(jd, lat, angle, t, ccw) {
    var s = sun(jd + t), noon = fix(12 - s.eqt, 24);
    var c = (-sin(angle) - sin(s.decl) * sin(lat)) / (cos(s.decl) * cos(lat));
    if (c > 1 || c < -1) return NaN;
    var T = acos(c) / 15;
    return noon + (ccw ? -T : T);
  }

  function asr(jd, lat, t) {
    var s = sun(jd + t), noon = fix(12 - s.eqt, 24);
    var angle = -acot(1 + tan(Math.abs(lat - s.decl)));
    var c = (-sin(angle) - sin(s.decl) * sin(lat)) / (cos(s.decl) * cos(lat));
    return noon + acos(Math.max(-1, Math.min(1, c))) / 15;
  }

  /** Hijri date (Kuwaiti algorithm): [day, month 1-12, year]. Close to Umm al-Qura, at most a day off. */
  function hijriParts(date) {
    var jd = Math.floor(julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) + 0.5);
    var iyear = 10631 / 30, shift = 8.01 / 60, z = jd - 1948084;
    var cyc = Math.floor(z / 10631);
    z = z - 10631 * cyc;
    var j = Math.floor((z - shift) / iyear), y = 30 * cyc + j;
    z = z - Math.floor(j * iyear + shift);
    var m = Math.floor((z + 28.5001) / 29.5);
    if (m === 13) m = 12;
    return [z - Math.floor(29.5001 * m - 29), m, y];
  }

  var MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
    'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

  function hijri(date) {
    try {
      var f = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {day: 'numeric', month: 'long', year: 'numeric'});
      if (f.resolvedOptions().calendar === 'islamic-umalqura') return f.format(date).replace(/\s*هـ$/, '') + ' هـ';
    } catch (e) {}
    var p = hijriParts(date);
    return p[0] + ' ' + MONTHS[p[1] - 1] + ' ' + p[2] + ' هـ';
  }

  /** Today's prayers as [{name, at (ms)}] for this place, in the TV's own time zone. */
  function times(date, lat, lon) {
    lat = parseFloat(lat); lon = parseFloat(lon);
    var day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var tz = -day.getTimezoneOffset() / 60;
    var jd = julian(day.getFullYear(), day.getMonth() + 1, day.getDate()) - lon / (15 * 24);
    var ramadan = hijriParts(day)[1] === 9;
    var h = {
      fajr: at(jd, lat, 18.5, 5 / 24, true),
      sunrise: at(jd, lat, 0.833, 6 / 24, true),
      dhuhr: fix(12 - sun(jd + 0.5).eqt, 24),
      asr: asr(jd, lat, 13 / 24),
      maghrib: at(jd, lat, 0.833, 18 / 24, false)
    };
    h.isha = h.maghrib + (ramadan ? 2 : 1.5);
    var base = day.getTime(), list = [
      ['الفجر', h.fajr], ['الشروق', h.sunrise], ['الظهر', h.dhuhr],
      ['العصر', h.asr], ['المغرب', h.maghrib], ['العشاء', h.isha]];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var hours = list[i][1] + tz - lon / 15;
      out.push({name: list[i][0], at: base + Math.round(hours * 60) * 60000, sunrise: i === 1});
    }
    return out;
  }

  function clock(ms) {
    var d = new Date(ms), h = d.getHours(), m = d.getMinutes();
    var pm = h >= 12;
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + (pm ? ' م' : ' ص');
  }

  /** The next prayer from now (tomorrow's Fajr after Isha): {name, at, index (-1 = tomorrow)}. */
  function next(now, lat, lon) {
    var list = times(now, lat, lon);
    for (var i = 0; i < list.length; i++) {
      if (!list[i].sunrise && list[i].at > now.getTime()) return {name: list[i].name, at: list[i].at, index: i};
    }
    var t = new Date(now.getTime() + 86400000);
    return {name: 'الفجر', at: times(t, lat, lon)[0].at, index: -1};
  }

  function left(ms) {
    var mins = Math.max(0, Math.ceil(ms / 60000)), h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + ' س ' + m + ' د';
    if (h) return h + ' ساعة';
    return m + ' دقيقة';
  }

  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  /** "السبت 31/10/2026م · 20 جمادى الأولى 1448 هـ", read right to left. */
  function dateLine(d) {
    var g = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + 'م';
    return '\u202B' + DAYS[d.getDay()] + ' ' + g + '  \u00B7  ' + hijri(d) + '\u202C';
  }

  window.Prayer = {times: times, next: next, clock: clock, left: left, hijri: hijri, dateLine: dateLine};
})();
