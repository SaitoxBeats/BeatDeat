// Espera o conteúdo da página ser totalmente carregado para executar o script

window.addEventListener('DOMContentLoaded', () => {
    // Referencias dos elementos
    const bpmDisplay = document.getElementById('bpm-display');
    const tapArea = document.body;
    const resetBtn = document.getElementById('reset-btn');

    // Configurações
    const MAX_HISTORY = 8;
    let currentBPM = 0;
    let tapHistory = [];
    let lastTapTime = 0;
    let bpmLock = false;
    let bpmLockValue = null;
    let bpmModaHistory = [];
    const BPM_HISTORY_SIZE = 10;
    const BPM_DOMINANCE_RATIO = 0.7; // 70%

    // Função para brilho do fundo
    function flashBackground() {
        tapArea.style.transition = 'background 0.1s';
        tapArea.style.background = '#fff';
        setTimeout(() => {
            tapArea.style.transition = 'background 0.1s';
            tapArea.style.background = '';
        }, 80);
    }

    // Método para filtrar outliers
    function FilterOutliers(intervals) {
        if (intervals.length < 3) return intervals;
        let sorted = [...intervals].sort((a, b) => a - b);
        let q1 = sorted[Math.floor(sorted.length * 0.25)];
        let q3 = sorted[Math.floor(sorted.length * 0.75)];
        let iqr = q3 - q1;
        return intervals.filter(interval => interval >= q1 - 1.5 * iqr && interval <= q3 + 1.5 * iqr);
    }

    // Método para resetar o contador
    function Reset() {
        tapHistory = [];
        currentBPM = 0;
        bpmDisplay.textContent = '0';
        lastTapTime = 0;
        bpmLock = false;
        bpmLockValue = null;
        bpmModaHistory = [];
        bpmDisplay.style.color = '';
        console.log('Detector resetado.');
    }

    // Método principal para processar o tap
    function ProcessTap() {
        let now = Date.now();
        // Se o intervalo for muito grande, reseta o histórico
        if (lastTapTime && now - lastTapTime > 10000) {
            Reset();
        }
        lastTapTime = now;
        tapHistory.push(now);
        if (tapHistory.length > MAX_HISTORY) {
            tapHistory.shift();
        }
        if (tapHistory.length > 1) {
            CalculateBPM();
        }
        flashBackground();
    }

    // Método para calcular BPM
    function CalculateBPM() {
        let intervals = [];
        for (let i = 1; i < tapHistory.length; i++) {
            intervals.push(tapHistory[i] - tapHistory[i - 1]);
        }
        let filteredIntervals = FilterOutliers(intervals);
        if (filteredIntervals.length > 0) {
            let totalIntervals = 0;
            for (let interval of filteredIntervals) {
                totalIntervals += interval;
            }
            let averageInterval = totalIntervals / filteredIntervals.length;
            let newBPM = Math.round(60000 / averageInterval);

            // Adiciona o novo BPM ao histórico
            bpmModaHistory.push(newBPM);
            if (bpmModaHistory.length > BPM_HISTORY_SIZE) {
                bpmModaHistory.shift();
            }

            // Calcula a moda
            let freq = {};
            let moda = newBPM;
            let maxCount = 0;
            for (let bpm of bpmModaHistory) {
                freq[bpm] = (freq[bpm] || 0) + 1;
                if (freq[bpm] > maxCount) {
                    maxCount = freq[bpm];
                    moda = bpm;
                }
            }
            let dominance = maxCount / bpmModaHistory.length;

            if (bpmLock) {
                // Se travado, só destrava se a moda mudar
                if (moda !== bpmLockValue) {
                    bpmLock = false;
                    bpmLockValue = null;
                    bpmDisplay.style.color = '';
                    bpmDisplay.textContent = moda.toString();
                } else {
                    bpmDisplay.textContent = bpmLockValue.toString();
                }
                return;
            }

            if (dominance >= BPM_DOMINANCE_RATIO && bpmModaHistory.length === BPM_HISTORY_SIZE) {
                bpmLock = true;
                bpmLockValue = moda;
                bpmDisplay.style.color = 'yellow';
                bpmDisplay.textContent = moda.toString();
            } else {
                bpmDisplay.style.color = '';
                bpmDisplay.textContent = moda.toString();
            }
        }
    }

    // Event Listeners
    tapArea.addEventListener('mousedown', (event) => {
        // Evita resetar ao clicar no botão
        if (event.target === resetBtn) return;
        ProcessTap();
    });
    document.addEventListener('keydown', (event) => {
        ProcessTap();
    });
    tapArea.addEventListener('touchstart', (event) => {
        if (event.target === resetBtn) return;
        event.preventDefault();
        ProcessTap();
    });
    resetBtn.addEventListener('click', () => {
        Reset();
        flashBackground();
    });
});