/* 发音：英式/美式两套本地音频（Edge TTS 合成）+ 浏览器语音兜底 */
const Audio2 = (() => {
  let current = null;
  const cache = {};
  let rate = 1;

  function stop() {
    if (current) { try { current.pause(); current.currentTime = 0; } catch (e) {} current = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function speakFallback(text, accent) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    const want = accent === 'us' ? /en-US/i : /en-GB/i;
    const vs = speechSynthesis.getVoices().filter(v => want.test(v.lang));
    if (vs.length) u.voice = vs[0];
    u.lang = accent === 'us' ? 'en-US' : 'en-GB';
    u.rate = rate * 0.95;
    speechSynthesis.speak(u);
  }

  function play(src, fallbackText, accent) {
    stop();
    if (!src) { speakFallback(fallbackText || '', accent); return Promise.resolve(); }
    return new Promise(resolve => {
      let a = cache[src];
      if (!a) {
        a = new window.Audio(src);
        a.preload = 'auto';
        a.onerror = () => { speakFallback(fallbackText || '', accent); resolve(); };
        cache[src] = a;
      }
      a.currentTime = 0;
      a.playbackRate = rate;
      current = a;
      a.play().then(resolve).catch(() => { speakFallback(fallbackText || '', accent); resolve(); });
    });
  }

  function playQueue(list, onIndex) {
    stop();
    let i = 0, cancelled = false;
    (function next() {
      if (cancelled || i >= list.length) { onIndex && onIndex(-1); return; }
      onIndex && onIndex(i);
      const a = new window.Audio(list[i].src);
      a.playbackRate = rate;
      current = a;
      a.onended = () => { i++; next(); };
      a.onerror = () => { i++; next(); };
      a.play().catch(() => { i++; next(); });
    })();
    return () => { cancelled = true; stop(); };
  }

  function setRate(r) { rate = r; if (current) current.playbackRate = r; }
  function getRate() { return rate; }

  return { play, playQueue, stop, speakFallback, setRate, getRate };
})();

const Recorder = (() => {
  let rec = null, chunks = [], stream = null;
  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec = new MediaRecorder(stream);
    chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.start();
  }
  function stop() {
    return new Promise(resolve => {
      if (!rec) return resolve(null);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        stream && stream.getTracks().forEach(t => t.stop());
        rec = null;
        resolve(URL.createObjectURL(blob));
      };
      rec.stop();
    });
  }
  return { start, stop };
})();
