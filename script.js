// Espera o conteúdo da página ser totalmente carregado para executar o script
window.addEventListener('DOMContentLoaded', () => {
    // Referencias dos elementos
    const bpmDisplay = document.getElementById('bpm-display');
    const tapArea = document.body;
    const resetBtn = document.getElementById('reset-btn');

    // Configurações
    const MAX_HISTORY = 8;
    const MIN_INTERVAL = 150; // Intervalo mínimo entre taps (ms) - evita taps muito rápidos
    const MAX_INTERVAL = 3000; // Intervalo máximo para considerar válido (ms)
    const RESET_TIMEOUT = 5000; // Tempo para reset automático (ms)
    
    let currentBPM = 0;
    let tapHistory = [];
    let lastTapTime = 0;
    let bpmLock = false;
    let bpmLockValue = null;
    let bpmHistory = [];
    const BPM_HISTORY_SIZE = 5;
    const BPM_DOMINANCE_RATIO = 0.6; // Reduzido para 60%
    
    let isProcessing = false; // Flag para evitar processamento múltiplo

    // Função para brilho do fundo
    function flashBackground() {
        if (tapArea.style.transition) return; // Evita múltiplos flashes
        
        tapArea.style.transition = 'background-color 0.1s ease';
        tapArea.style.backgroundColor = '#fff';
        
        setTimeout(() => {
            tapArea.style.backgroundColor = '';
            setTimeout(() => {
                tapArea.style.transition = '';
            }, 100);
        }, 80);
    }

    // Método para filtrar outliers (melhorado)
    function filterOutliers(intervals) {
        if (intervals.length < 3) return intervals;
        
        // Remove intervalos muito pequenos ou muito grandes
        let validIntervals = intervals.filter(interval => 
            interval >= MIN_INTERVAL && interval <= MAX_INTERVAL
        );
        
        if (validIntervals.length === 0) return [];
        
        // Aplicar filtro IQR apenas se temos dados suficientes
        if (validIntervals.length >= 5) {
            let sorted = [...validIntervals].sort((a, b) => a - b);
            let q1 = sorted[Math.floor(sorted.length * 0.25)];
            let q3 = sorted[Math.floor(sorted.length * 0.75)];
            let iqr = q3 - q1;
            
            if (iqr > 0) {
                let lowerBound = q1 - 1.5 * iqr;
                let upperBound = q3 + 1.5 * iqr;
                return validIntervals.filter(interval => 
                    interval >= lowerBound && interval <= upperBound
                );
            }
        }
        
        return validIntervals;
    }

    // Método para resetar o contador
    function reset() {
        tapHistory = [];
        currentBPM = 0;
        bpmDisplay.textContent = '0';
        lastTapTime = 0;
        bpmLock = false;
        bpmLockValue = null;
        bpmHistory = [];
        isProcessing = false;
        bpmDisplay.style.color = '';
        console.log('Detector resetado.');
    }

    // Método para calcular a moda mais robusta
    function calculateMode(values) {
        if (values.length === 0) return null;
        
        let frequency = {};
        let maxCount = 0;
        let mode = values[0];
        
        values.forEach(value => {
            frequency[value] = (frequency[value] || 0) + 1;
            if (frequency[value] > maxCount) {
                maxCount = frequency[value];
                mode = value;
            }
        });
        
        return {
            value: mode,
            count: maxCount,
            dominance: maxCount / values.length
        };
    }

    // Método principal para processar o tap (melhorado)
    function processTap() {
        if (isProcessing) return; // Evita processamento múltiplo
        
        let now = Date.now();
        
        // Debouncing - evita taps muito rápidos
        if (lastTapTime && now - lastTapTime < MIN_INTERVAL) {
            return;
        }
        
        // Se o intervalo for muito grande, reseta o histórico
        if (lastTapTime && now - lastTapTime > RESET_TIMEOUT) {
            reset();
            now = Date.now(); // Atualiza o tempo após reset
        }
        
        isProcessing = true;
        lastTapTime = now;
        tapHistory.push(now);
        
        // Mantém apenas os últimos MAX_HISTORY taps
        if (tapHistory.length > MAX_HISTORY) {
            tapHistory.shift();
        }
        
        if (tapHistory.length >= 2) {
            calculateBPM();
        }
        
        flashBackground();
        
        // Libera o processamento após um pequeno delay
        setTimeout(() => {
            isProcessing = false;
        }, 50);
    }

    // Método para calcular BPM (melhorado)
    function calculateBPM() {
        if (tapHistory.length < 2) return;
        
        // Calcula intervalos entre taps
        let intervals = [];
        for (let i = 1; i < tapHistory.length; i++) {
            intervals.push(tapHistory[i] - tapHistory[i - 1]);
        }
        
        // Filtra outliers
        let filteredIntervals = filterOutliers(intervals);
        
        if (filteredIntervals.length === 0) {
            return; // Não atualiza se não há intervalos válidos
        }
        
        // Calcula média dos intervalos filtrados
        let totalInterval = filteredIntervals.reduce((sum, interval) => sum + interval, 0);
        let averageInterval = totalInterval / filteredIntervals.length;
        
        // Converte para BPM e limita valores razoáveis
        let newBPM = Math.round(60000 / averageInterval);
        newBPM = Math.max(30, Math.min(300, newBPM)); // Limita entre 30 e 300 BPM
        
        // Adiciona ao histórico de BPM
        bpmHistory.push(newBPM);
        if (bpmHistory.length > BPM_HISTORY_SIZE) {
            bpmHistory.shift();
        }
        
        // Calcula moda
        let modeResult = calculateMode(bpmHistory);
        if (!modeResult) return;
        
        let { value: mode, dominance } = modeResult;
        
        // Sistema de travamento melhorado
        if (bpmLock) {
            // Se travado, verifica se deve destravar
            let currentModeResult = calculateMode(bpmHistory.slice(-5)); // Últimos 5 valores
            if (currentModeResult && currentModeResult.value !== bpmLockValue && 
                currentModeResult.dominance > 0.6) {
                // Destrava se nova moda for consistente
                bpmLock = false;
                bpmLockValue = null;
                bpmDisplay.style.color = '';
                console.log('BPM destravado para:', currentModeResult.value);
            }
        }
        
        // Atualiza display
        if (bpmLock) {
            bpmDisplay.textContent = bpmLockValue.toString();
        } else {
            // Trava se houver dominância suficiente
            if (dominance >= BPM_DOMINANCE_RATIO && bpmHistory.length >= Math.min(6, BPM_HISTORY_SIZE)) {
                bpmLock = true;
                bpmLockValue = mode;
                bpmDisplay.style.color = '#FFD700'; // Dourado em vez de amarelo
                console.log('BPM travado em:', mode);
            } else {
                bpmDisplay.style.color = '';
            }
            bpmDisplay.textContent = mode.toString();
        }
        
        currentBPM = mode;
    }

    // Event Listeners melhorados
    let touchStarted = false;
    let mousePressed = false;

    // Mouse events
    tapArea.addEventListener('mousedown', (event) => {
        if (event.target === resetBtn) return;
        if (touchStarted) return; // Evita conflito com touch
        
        mousePressed = true;
        processTap();
    });

    tapArea.addEventListener('mouseup', () => {
        mousePressed = false;
    });

    // Touch events (com melhor handling)
    tapArea.addEventListener('touchstart', (event) => {
        if (event.target === resetBtn) return;
        
        event.preventDefault(); // Previne scroll e outros comportamentos
        touchStarted = true;
        
        // Processa apenas o primeiro toque
        if (event.touches.length === 1) {
            processTap();
        }
    }, { passive: false });

    tapArea.addEventListener('touchend', (event) => {
        event.preventDefault();
        setTimeout(() => {
            touchStarted = false;
        }, 100);
    }, { passive: false });

    // Keyboard events
    document.addEventListener('keydown', (event) => {
        // Evita repetição automática de teclas
        if (event.repeat) return;
        processTap();
    });

    // Reset button
    resetBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        reset();
        flashBackground();
    });

    // Previne seleção de texto e outros comportamentos indesejados
    tapArea.addEventListener('selectstart', (e) => e.preventDefault());
    tapArea.addEventListener('dragstart', (e) => e.preventDefault());
    
    // Reset automático quando a página perde foco
    window.addEventListener('blur', () => {
        setTimeout(() => {
            if (tapHistory.length > 0) {
                reset();
            }
        }, 1000);
    });

    console.log('BPM Detector inicializado com sucesso!');
});