// Espera o conteúdo da página ser totalmente carregado para executar o script
window.addEventListener('DOMContentLoaded', () => {
    const bpmDisplay = document.getElementById('bpm-display');
    const tapArea = document.body;
    const resetBtn = document.getElementById('reset-btn');

    // --- Configurações ---
    const MAX_HISTORY = 10;            // Mais taps = regressão mais precisa
    const MIN_INTERVAL = 200;          // ms entre taps (300 BPM cap)
    const MAX_INTERVAL = 3000;         // Acima disso, intervalo descartado
    const RESET_TIMEOUT = 5000;        // Reset automático após pausa
    const PROCESS_LOCKOUT = 120;       // Cooldown defensivo contra disparos concorrentes
    const GHOST_CLICK_GUARD = 600;     // Bloqueia mouse após touchend (clique-fantasma)
    const BPM_HISTORY_SIZE = 5;
    const BPM_DOMINANCE_RATIO = 0.6;
    const MIN_BPM = 30;
    const MAX_BPM = 300;

    let tapHistory = [];               // timestamps de performance.now()
    let lastTapTime = 0;
    let bpmLock = false;
    let bpmLockValue = null;
    let bpmHistory = [];
    let isProcessing = false;
    let flashing = false;

    // Estado de toque para evitar misclicks no mobile
    let activeTouchId = null;
    let touchActive = false;
    let lastTouchEnd = 0;

    // Remove o atraso de 300ms e desabilita double-tap-zoom no mobile
    tapArea.style.touchAction = 'manipulation';

    function flashBackground() {
        if (flashing) return;
        flashing = true;
        tapArea.style.transition = 'background-color 0.08s ease';
        tapArea.style.backgroundColor = '#fff';
        setTimeout(() => {
            tapArea.style.backgroundColor = '';
            setTimeout(() => {
                tapArea.style.transition = '';
                flashing = false;
            }, 100);
        }, 80);
    }

    function reset() {
        tapHistory = [];
        bpmHistory = [];
        lastTapTime = 0;
        bpmLock = false;
        bpmLockValue = null;
        isProcessing = false;
        bpmDisplay.textContent = '0';
        bpmDisplay.style.color = '';
    }

    function median(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function calculateMode(values) {
        if (values.length === 0) return null;
        const frequency = {};
        let maxCount = 0;
        let mode = values[0];
        for (const v of values) {
            frequency[v] = (frequency[v] || 0) + 1;
            if (frequency[v] > maxCount) {
                maxCount = frequency[v];
                mode = v;
            }
        }
        return { value: mode, count: maxCount, dominance: maxCount / values.length };
    }

    // BPM via regressão linear de (índice da batida, tempo).
    // Usar todos os taps como mínimos quadrados é mais preciso que a média de
    // intervalos, que se reduz a (último - primeiro)/n e descarta taps intermediários.
    function calculateBPM() {
        if (tapHistory.length < 2) return;

        const intervals = [];
        for (let i = 1; i < tapHistory.length; i++) {
            intervals.push(tapHistory[i] - tapHistory[i - 1]);
        }

        const med = median(intervals);
        if (med < MIN_INTERVAL || med > MAX_INTERVAL) return;

        // Mapeia cada tap a um índice de batida. Descarta double-taps acidentais
        // e contabiliza batidas perdidas para que a regressão fique consistente.
        const points = [{ idx: 0, t: tapHistory[0] }];
        let prevIdx = 0;
        let prevTime = tapHistory[0];

        for (let i = 1; i < tapHistory.length; i++) {
            const dt = tapHistory[i] - prevTime;
            if (dt < med * 0.5) continue; // double-tap acidental: ignora
            const beatsElapsed = Math.max(1, Math.round(dt / med));
            prevIdx += beatsElapsed;
            prevTime = tapHistory[i];
            points.push({ idx: prevIdx, t: tapHistory[i] });
        }

        if (points.length < 2) return;

        // Regressão linear: t = a + b*idx (b = ms por batida)
        const n = points.length;
        let sumI = 0, sumT = 0;
        for (const p of points) { sumI += p.idx; sumT += p.t; }
        const meanI = sumI / n;
        const meanT = sumT / n;
        let num = 0, den = 0;
        for (const p of points) {
            const di = p.idx - meanI;
            num += di * (p.t - meanT);
            den += di * di;
        }
        if (den <= 0) return;
        const slope = num / den;
        if (slope < MIN_INTERVAL || slope > MAX_INTERVAL) return;

        let newBPM = Math.round(60000 / slope);
        newBPM = Math.max(MIN_BPM, Math.min(MAX_BPM, newBPM));

        bpmHistory.push(newBPM);
        if (bpmHistory.length > BPM_HISTORY_SIZE) bpmHistory.shift();

        const modeResult = calculateMode(bpmHistory);
        if (!modeResult) return;
        const { value: mode, dominance } = modeResult;

        if (bpmLock) {
            const recent = calculateMode(bpmHistory.slice(-Math.min(5, BPM_HISTORY_SIZE)));
            if (recent && recent.value !== bpmLockValue && recent.dominance > 0.6) {
                bpmLock = false;
                bpmLockValue = null;
                bpmDisplay.style.color = '';
            }
        }

        if (bpmLock) {
            bpmDisplay.textContent = bpmLockValue.toString();
        } else {
            if (dominance >= BPM_DOMINANCE_RATIO &&
                bpmHistory.length >= Math.min(4, BPM_HISTORY_SIZE)) {
                bpmLock = true;
                bpmLockValue = mode;
                bpmDisplay.style.color = '#FFD700';
            } else {
                bpmDisplay.style.color = '';
            }
            bpmDisplay.textContent = mode.toString();
        }
    }

    function processTap() {
        if (isProcessing) return;
        const now = performance.now();

        if (lastTapTime && now - lastTapTime < MIN_INTERVAL) return;
        if (lastTapTime && now - lastTapTime > RESET_TIMEOUT) reset();

        isProcessing = true;
        lastTapTime = now;
        tapHistory.push(now);
        if (tapHistory.length > MAX_HISTORY) tapHistory.shift();

        if (tapHistory.length >= 2) calculateBPM();
        flashBackground();

        setTimeout(() => { isProcessing = false; }, PROCESS_LOCKOUT);
    }

    // --- Event listeners ---

    // Mouse: bloqueia clique-fantasma logo após interação por toque
    tapArea.addEventListener('mousedown', (event) => {
        if (event.target === resetBtn) return;
        if (touchActive) return;
        if (performance.now() - lastTouchEnd < GHOST_CLICK_GUARD) return;
        processTap();
    });

    // Touch: rastreia o primeiro dedo via identifier para ignorar toques extras
    // (palma, segundo dedo) sem bloquear o próximo tap legítimo.
    tapArea.addEventListener('touchstart', (event) => {
        if (event.target === resetBtn) return;
        event.preventDefault();
        if (activeTouchId !== null) return;
        const t = event.changedTouches[0];
        activeTouchId = t.identifier;
        touchActive = true;
        processTap();
    }, { passive: false });

    function endTouch(event) {
        if (activeTouchId === null) return;
        for (const t of event.changedTouches) {
            if (t.identifier === activeTouchId) {
                activeTouchId = null;
                touchActive = false;
                lastTouchEnd = performance.now();
                return;
            }
        }
    }

    tapArea.addEventListener('touchend', endTouch);
    tapArea.addEventListener('touchcancel', endTouch);

    document.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        const tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        processTap();
    });

    resetBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        reset();
        flashBackground();
    });

    tapArea.addEventListener('selectstart', (e) => e.preventDefault());
    tapArea.addEventListener('dragstart', (e) => e.preventDefault());
    tapArea.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('blur', () => {
        setTimeout(() => {
            if (tapHistory.length > 0) reset();
        }, 1000);
    });
});
