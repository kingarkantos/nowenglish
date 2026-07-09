import { words } from './words.js';

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = "https://czympfukmtglynkuyybe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eW1wZnVrbXRnbHlua3V5eWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDYzODMxNTUsImV4cCI6MjAyMTk1OTE1NX0.eT73t8NPm5ON1QIpTMk36WU1uNRDyW250n5GDxmVEkc";

let supabase = null;
if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.warn("Supabase client não carregado. O aplicativo rodará apenas localmente.");
}

// --- CONFIGURAÇÕES DO CRONOGRAMA ---
const WORDS_PER_DAY = 11;
const TOTAL_DAYS = 90;

// --- ESTADO GLOBAL ---
let state = {
    currentDay: 1,           // Dia selecionado para estudar/praticar
    maxUnlockedDay: 1,       // Último dia desbloqueado
    lastCompletedDay: 0,     // Último dia concluído com nota >= 70%
    streak: 0,               // Ofensiva de dias seguidos
    lastActiveDate: null,    // Data da última atividade
    scoreHistory: {},        // Histórico de notas por dia { dayNumber: score }
    struggledWords: [],      // Lista de IDs de palavras marcadas para revisão adicional
    reviewCompletedToday: false // Se o usuário já fez a revisão obrigatória hoje
};

// --- ESTADOS DA SESSÃO ATUAL ---
let currentSession = {
    type: 'study',          // 'study', 'review', 'exercise'
    words: [],              // Lista de palavras da sessão
    currentIndex: 0,        // Índice da palavra atual
    answers: [],            // Respostas dadas nos exercícios
    correctCount: 0,        // Contador de acertos
    struggledAdded: []      // Palavras que o usuário errou na sessão atual
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    loadProgress();
    setupSpeechVoices();
    renderDaysGrid();
    updateDashboardUI();
    registerEventListeners();
    
    // Atualiza a visualização inicial
    switchView('dashboard');

    // Inicializa sincronização assíncrona com Supabase
    if (supabase) {
        await initSupabaseSync();
    }
});

// --- PERSISTÊNCIA (LOCALSTORAGE & CLOUD) ---
function loadProgress() {
    const saved = localStorage.getItem('nowenglish_progress');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            
            // Verificar ofensiva (streak)
            checkStreak();
        } catch (e) {
            console.error("Erro ao carregar progresso local, usando padrão.", e);
        }
    }
}

function saveProgress() {
    const nowIso = new Date().toISOString();
    localStorage.setItem('nowenglish_progress', JSON.stringify(state));
    localStorage.setItem('nowenglish_progress_updated_at', nowIso);
    
    // Sincroniza em segundo plano
    if (supabase) {
        syncProgressToSupabase(nowIso);
    }
}

async function initSupabaseSync() {
    let userId = localStorage.getItem('nowenglish_user_id');
    
    if (!userId) {
        // Usuário novo - cria registro no Supabase
        try {
            const { data, error } = await supabase
                .from('nowenglish_users')
                .insert({})
                .select('id')
                .single();
                
            if (error) throw error;
            
            userId = data.id;
            localStorage.setItem('nowenglish_user_id', userId);
            console.log("Novo usuário Supabase registrado:", userId);
            
            // Sincroniza progresso atual
            await syncProgressToSupabase();
        } catch (err) {
            console.error("Erro ao registrar novo usuário no Supabase:", err);
        }
    } else {
        // Usuário existente - busca progresso
        try {
            const { data, error } = await supabase
                .from('nowenglish_progress')
                .select('*')
                .eq('user_id', userId)
                .single();
                
            if (error) {
                console.log("Progresso não encontrado no Supabase para o usuário. Inicializando na nuvem...");
                await syncProgressToSupabase();
            } else if (data) {
                // Compara data de alteração local e na nuvem
                const localSavedTime = localStorage.getItem('nowenglish_progress_updated_at');
                const localTime = localSavedTime ? new Date(localSavedTime).getTime() : 0;
                const cloudTime = new Date(data.updated_at).getTime();
                
                if (cloudTime > localTime) {
                    console.log("Carregando progresso mais recente da nuvem (Supabase)...");
                    state.maxUnlockedDay = data.max_unlocked_day;
                    state.lastCompletedDay = data.last_completed_day;
                    state.streak = data.streak;
                    state.lastActiveDate = data.last_active_date;
                    state.scoreHistory = data.score_history || {};
                    state.struggledWords = data.struggled_words || [];
                    
                    localStorage.setItem('nowenglish_progress', JSON.stringify(state));
                    localStorage.setItem('nowenglish_progress_updated_at', data.updated_at);
                    
                    renderDaysGrid();
                    updateDashboardUI();
                } else if (localTime > cloudTime) {
                    console.log("Progresso local é mais recente. Enviando para a nuvem...");
                    await syncProgressToSupabase();
                } else {
                    console.log("Progresso local e nuvem em sincronia.");
                }
            }
        } catch (err) {
            console.error("Erro na sincronização de progresso:", err);
        }
    }
}

async function syncProgressToSupabase(updatedAt = null) {
    const userId = localStorage.getItem('nowenglish_user_id');
    if (!userId || !supabase) return;
    
    const timeStr = updatedAt || new Date().toISOString();
    
    try {
        const { error } = await supabase
            .from('nowenglish_progress')
            .upsert({
                user_id: userId,
                max_unlocked_day: state.maxUnlockedDay,
                last_completed_day: state.lastCompletedDay,
                streak: state.streak,
                last_active_date: state.lastActiveDate,
                score_history: state.scoreHistory,
                struggled_words: state.struggledWords,
                updated_at: timeStr
            });
            
        if (error) {
            console.error("Erro ao enviar dados para o Supabase:", error);
        } else {
            console.log("Progresso sincronizado com o Supabase com sucesso.");
        }
    } catch (err) {
        console.error("Erro ao chamar Supabase upsert:", err);
    }
}

function checkStreak() {
    if (!state.lastActiveDate) return;
    
    const today = new Date().toDateString();
    const lastActive = new Date(state.lastActiveDate).toDateString();
    
    if (today === lastActive) return; // Já acessou hoje, mantém a ofensiva
    
    const diffTime = Math.abs(new Date(today) - new Date(lastActive));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        // Acessou no dia seguinte, mantém streak ativo (será incrementado ao concluir a lição)
    } else if (diffDays > 1) {
        // Quebrou a ofensiva
        state.streak = 0;
        saveProgress();
    }
}

// --- CONFIGURAÇÃO DE ÁUDIO (WEB SPEECH API) ---
let englishVoice = null;

function setupSpeechVoices() {
    if (!('speechSynthesis' in window)) return;
    
    const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        // Procura voz nativa americana (preferencialmente Google ou Microsoft)
        englishVoice = voices.find(v => v.lang.startsWith('en-US')) || 
                       voices.find(v => v.lang.startsWith('en-GB')) || 
                       voices.find(v => v.lang.startsWith('en')) || 
                       voices[0];
    };
    
    setVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = setVoice;
    }
}

function speakText(text) {
    if (!('speechSynthesis' in window)) {
        alert("A API de áudio não é suportada neste navegador.");
        return;
    }
    
    window.speechSynthesis.cancel(); // Para qualquer fala ativa
    
    const utterance = new SpeechSynthesisUtterance(text);
    if (englishVoice) {
        utterance.voice = englishVoice;
    }
    utterance.rate = 0.9; // Velocidade ligeiramente reduzida para facilitar o entendimento
    window.speechSynthesis.speak(utterance);
}

// --- GERENCIADOR DE VISUALIZAÇÕES (SPA ROUTING) ---
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(`${viewId}-view`);
    if (activeSection) {
        activeSection.classList.add('active');
        state.activeView = viewId;
    }
    
    // Atualiza classes ativas da navbar
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.view === viewId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Habilitar botões na navbar dependendo do estado
    const studyBtn = document.getElementById('nav-btn-study');
    const reviewBtn = document.getElementById('nav-btn-review');

    if (state.lastCompletedDay > 0) {
        reviewBtn.removeAttribute('disabled');
    } else {
        reviewBtn.setAttribute('disabled', 'true');
    }

    if (state.maxUnlockedDay >= state.currentDay) {
        studyBtn.removeAttribute('disabled');
    }

    // Scroll para o topo
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Atualiza dados na tela se for dashboard ou estatísticas
    if (viewId === 'dashboard') {
        updateDashboardUI();
        renderDaysGrid();
    } else if (viewId === 'stats') {
        renderStatsUI();
    }
}

// --- GERENCIADOR DE DADOS DAS PALAVRAS POR DIA ---
function getWordsForDay(dayNumber) {
    const start = (dayNumber - 1) * WORDS_PER_DAY;
    let end = dayNumber * WORDS_PER_DAY;
    if (dayNumber === TOTAL_DAYS) {
        end = words.length; // Último dia pega as palavras restantes (até 1000)
    }
    return words.slice(start, end);
}

// --- CONTROLLER DO PAINEL (DASHBOARD) ---
function updateDashboardUI() {
    // Atualiza cards de estatísticas rápidas
    const totalWords = words.length;
    const learnedCount = state.lastCompletedDay * WORDS_PER_DAY;
    document.getElementById('stat-words-learned').textContent = `${Math.min(learnedCount, totalWords)}/${totalWords}`;
    document.getElementById('stat-current-day').textContent = `Dia ${state.maxUnlockedDay}`;
    
    // Calcula nota média
    const scores = Object.values(state.scoreHistory);
    if (scores.length > 0) {
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        document.getElementById('stat-avg-score').textContent = `${avg}%`;
    } else {
        document.getElementById('stat-avg-score').textContent = `--%`;
    }
    
    document.getElementById('stat-streak').textContent = `${state.streak} ${state.streak === 1 ? 'dia' : 'dias'}`;

    // Determinar a ação principal no Box do Hero
    const statusBox = document.getElementById('dashboard-status-box');
    const previousDay = state.maxUnlockedDay - 1;
    
    // Verifica se precisa revisar o dia anterior
    const needsReview = previousDay > 0 && !state.reviewCompletedToday;
    
    if (needsReview) {
        statusBox.innerHTML = `
            <span class="badge badge-warning">Ação Necessária</span>
            <h3 style="margin-top: 0.5rem; margin-bottom: 0.5rem;">Revisão Diária</h3>
            <p>Revise as palavras do <strong>Dia ${previousDay}</strong> antes de começar a lição de hoje.</p>
            <button class="btn btn-primary btn-glow" id="dashboard-action-btn">Revisar Dia ${previousDay}</button>
        `;
        document.getElementById('dashboard-action-btn').addEventListener('click', () => {
            startReviewSession(previousDay);
        });
    } else if (state.maxUnlockedDay <= TOTAL_DAYS) {
        statusBox.innerHTML = `
            <span class="badge badge-success">Disponível</span>
            <h3 style="margin-top: 0.5rem; margin-bottom: 0.5rem;">Nova Lição Liberada!</h3>
            <p>Aprenda as novas palavras recomendadas para o <strong>Dia ${state.maxUnlockedDay}</strong>.</p>
            <button class="btn btn-secondary btn-glow" id="dashboard-action-btn">Estudar Dia ${state.maxUnlockedDay}</button>
        `;
        document.getElementById('dashboard-action-btn').addEventListener('click', () => {
            startStudySession(state.maxUnlockedDay);
        });
    } else {
        statusBox.innerHTML = `
            <span class="badge badge-success">Parabéns!</span>
            <h3 style="margin-top: 0.5rem; margin-bottom: 0.5rem;">Jornada Completa!</h3>
            <p>Você estudou todo o cronograma das 1000 palavras. Continue praticando.</p>
            <button class="btn btn-outline" id="dashboard-action-btn">Ver Estatísticas</button>
        `;
        document.getElementById('dashboard-action-btn').addEventListener('click', () => {
            switchView('stats');
        });
    }
}

function renderDaysGrid() {
    const container = document.getElementById('days-grid-container');
    container.innerHTML = '';
    
    for (let day = 1; day <= TOTAL_DAYS; day++) {
        const card = document.createElement('div');
        card.className = 'day-card';
        
        let status = 'locked';
        let score = null;
        
        if (day <= state.lastCompletedDay) {
            status = 'completed';
            score = state.scoreHistory[day];
        } else if (day === state.maxUnlockedDay) {
            status = 'unlocked';
        }
        
        card.classList.add(status);
        
        const numberSpan = document.createElement('span');
        numberSpan.className = 'day-card-number';
        numberSpan.textContent = day;
        card.appendChild(numberSpan);
        
        const statusSpan = document.createElement('span');
        statusSpan.className = 'day-card-status';
        
        if (status === 'completed') {
            statusSpan.textContent = 'Concluído';
            
            // Badge com a nota
            const scoreBadge = document.createElement('span');
            scoreBadge.className = 'day-score-badge';
            scoreBadge.textContent = `${score}%`;
            card.appendChild(scoreBadge);
        } else if (status === 'unlocked') {
            statusSpan.textContent = 'Iniciar';
        } else {
            statusSpan.textContent = 'Bloqueado';
        }
        
        card.appendChild(statusSpan);
        
        // Ação ao clicar no card de dia
        card.addEventListener('click', () => {
            if (status === 'locked') {
                // Efeito de erro ao clicar
                card.classList.add('shake');
                setTimeout(() => card.classList.remove('shake'), 500);
                return;
            }
            
            // Ao clicar em um dia liberado, o usuário estuda
            state.currentDay = day;
            startStudySession(day);
        });
        
        container.appendChild(card);
    }
}

// --- CONTROLLER DO MÓDULO DE ESTUDO (STUDY) ---
function startStudySession(dayNumber) {
    state.currentDay = dayNumber;
    const dayWords = getWordsForDay(dayNumber);
    
    currentSession = {
        type: 'study',
        words: dayWords,
        currentIndex: 0,
        answers: [],
        correctCount: 0,
        struggledAdded: []
    };
    
    document.getElementById('study-view-title').textContent = `Lição: Dia ${dayNumber}`;
    switchView('study');
    renderStudyWord();
}

function renderStudyWord() {
    const session = currentSession;
    const wordObj = session.words[session.currentIndex];
    
    // Atualiza barra de progresso
    const progressPercent = ((session.currentIndex + 1) / session.words.length) * 100;
    document.getElementById('study-progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('study-progress-text').textContent = `${session.currentIndex + 1} de ${session.words.length} palavras`;
    
    // Reseta o card para frente
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.remove('flipped');
    
    const cardBack = document.querySelector('#study-view .card-back');
    cardBack.classList.add('hide');

    // Insere dados no card (Frente)
    document.getElementById('study-english-word').textContent = wordObj.word;
    
    // Insere dados no card (Verso)
    document.getElementById('study-word-back').textContent = wordObj.word;
    document.getElementById('study-translation').textContent = wordObj.translation;
    document.getElementById('study-example-eng').textContent = wordObj.example;
    document.getElementById('study-example-por').textContent = wordObj.exampleTranslation;
    
    // Controle de botões de navegação
    document.getElementById('study-btn-prev').disabled = session.currentIndex === 0;
    
    if (session.currentIndex === session.words.length - 1) {
        document.getElementById('study-btn-next').textContent = 'Iniciar Exercícios ➔';
        document.getElementById('study-btn-next').className = 'btn btn-secondary btn-glow';
    } else {
        document.getElementById('study-btn-next').textContent = 'Entendi! Próximo';
        document.getElementById('study-btn-next').className = 'btn btn-secondary';
    }
    
    // Toca o áudio da palavra automaticamente para guiar o estudante
    setTimeout(() => speakText(wordObj.word), 300);
}

function handleStudyNext() {
    const session = currentSession;
    const flashcard = document.getElementById('flashcard');
    
    if (session.currentIndex === session.words.length - 1) {
        // Última palavra, vai para os exercícios do dia
        startExerciseSession(state.currentDay);
    } else {
        session.currentIndex++;
        renderStudyWord();
    }
}

function handleStudyPrev() {
    if (currentSession.currentIndex > 0) {
        currentSession.currentIndex--;
        renderStudyWord();
    }
}

// --- CONTROLLER DO MÓDULO DE REVISÃO (REVIEW) ---
function startReviewSession(dayNumber) {
    const reviewWords = getWordsForDay(dayNumber);
    
    // Embaralha as palavras para uma revisão mais eficiente
    const shuffledWords = [...reviewWords].sort(() => 0.5 - Math.random());
    
    currentSession = {
        type: 'review',
        words: shuffledWords,
        currentIndex: 0,
        answers: [],
        correctCount: 0,
        struggledAdded: []
    };
    
    switchView('review');
    renderReviewWord();
}

function renderReviewWord() {
    const session = currentSession;
    const wordObj = session.words[session.currentIndex];
    
    // Progresso da revisão
    const progressPercent = (session.currentIndex / session.words.length) * 100;
    document.getElementById('review-progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('review-progress-text').textContent = `${session.currentIndex + 1} de ${session.words.length} palavras`;
    
    // Reseta card
    const flashcard = document.getElementById('review-flashcard');
    flashcard.classList.remove('flipped');
    document.querySelector('#review-view .card-back').classList.add('hide');
    
    // Dados da frente
    document.getElementById('review-english-word').textContent = wordObj.word;
    
    // Dados do verso
    document.getElementById('review-word-back').textContent = wordObj.word;
    document.getElementById('review-translation').textContent = wordObj.translation;
    document.getElementById('review-example-eng').textContent = wordObj.example;
    document.getElementById('review-example-por').textContent = wordObj.exampleTranslation;
    
    // Desabilita botões de feedback até revelar tradução
    document.getElementById('review-btn-forgot').disabled = true;
    document.getElementById('review-btn-remembered').disabled = true;
    
    // Toca a palavra
    setTimeout(() => speakText(wordObj.word), 300);
}

function handleReviewReveal() {
    const flashcard = document.getElementById('review-flashcard');
    flashcard.classList.add('flipped');
    document.querySelector('#review-view .card-back').classList.remove('hide');
    
    // Habilita os botões de resposta
    document.getElementById('review-btn-forgot').disabled = false;
    document.getElementById('review-btn-remembered').disabled = false;
}

function handleReviewFeedback(remembered) {
    const session = currentSession;
    const wordObj = session.words[session.currentIndex];
    
    if (!remembered) {
        // Adiciona à lista de palavras difíceis (struggledWords)
        if (!state.struggledWords.includes(wordObj.id)) {
            state.struggledWords.push(wordObj.id);
        }
    } else {
        // Se lembrou e estava na lista de dificuldades, remove (opcional, incentiva a limpeza da lista)
        const idx = state.struggledWords.indexOf(wordObj.id);
        if (idx > -1) {
            state.struggledWords.splice(idx, 1);
        }
    }
    
    saveProgress();
    
    if (session.currentIndex === session.words.length - 1) {
        // Revisão concluída
        state.reviewCompletedToday = true;
        alert("Revisão concluída! Agora a lição de hoje está liberada.");
        switchView('dashboard');
    } else {
        session.currentIndex++;
        renderReviewWord();
    }
}

// --- CONTROLLER DO MÓDULO DE EXERCÍCIOS (EXERCISE) ---
function startExerciseSession(dayNumber) {
    const dayWords = getWordsForDay(dayNumber);
    
    // Gerar 10 questões a partir das palavras do dia
    // Se o dia tiver 11 palavras, selecionamos 10 aleatórias. Se for o dia 90 (21 palavras), pegamos 12 questões.
    const exerciseWords = [...dayWords].sort(() => 0.5 - Math.random());
    const count = dayNumber === TOTAL_DAYS ? 12 : 10;
    const sessionWords = exerciseWords.slice(0, count);
    
    currentSession = {
        type: 'exercise',
        words: sessionWords,
        currentIndex: 0,
        answers: [],
        correctCount: 0,
        struggledAdded: []
    };
    
    document.getElementById('exercise-view-title').textContent = `Exercícios: Dia ${dayNumber}`;
    switchView('exercise');
    generateExerciseQuestion();
}

function generateExerciseQuestion() {
    const session = currentSession;
    const wordObj = session.words[session.currentIndex];
    
    // Atualiza barra de progresso
    const progressPercent = (session.currentIndex / session.words.length) * 100;
    document.getElementById('exercise-progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('exercise-progress-text').textContent = `Questão ${session.currentIndex + 1} de ${session.words.length}`;
    
    // Oculta banner de feedback
    document.getElementById('feedback-banner').className = 'feedback-banner hide';
    
    // Esconde todos os containers de questões
    document.getElementById('q-multichoice').classList.add('hide');
    document.getElementById('q-spelling').classList.add('hide');
    document.getElementById('q-cloze').classList.add('hide');
    
    // Escolhe aleatoriamente um tipo de questão: 0=MultiChoice, 1=Spelling, 2=Cloze
    // Garantimos que palavras com exemplos ruins não gerem Cloze
    let qType = Math.floor(Math.random() * 3);
    
    // Se a palavra não tiver frase exemplo válida ou curta, fallback para múltipla escolha
    if (qType === 2 && (!wordObj.example || !wordObj.example.includes(wordObj.word))) {
        qType = 0;
    }
    
    if (qType === 0) {
        setupMultiChoiceQuestion(wordObj);
    } else if (qType === 1) {
        setupSpellingQuestion(wordObj);
    } else {
        setupClozeQuestion(wordObj);
    }
}

// 1. Múltipla Escolha
function setupMultiChoiceQuestion(wordObj) {
    const container = document.getElementById('q-multichoice');
    container.classList.remove('hide');
    
    document.getElementById('mc-question-text').textContent = `Qual a tradução correta para a palavra "${wordObj.word}"?`;
    
    // Gerar 3 opções erradas (distratores)
    const distractors = getRandomDistractors(wordObj.id, 3);
    const options = [wordObj.translation, ...distractors].sort(() => 0.5 - Math.random());
    
    const buttons = container.querySelectorAll('.option-btn');
    buttons.forEach((btn, idx) => {
        btn.textContent = options[idx];
        btn.className = 'option-btn glass';
        btn.disabled = false;
        
        btn.onclick = () => {
            // Desabilita todos para evitar múltiplos cliques
            buttons.forEach(b => b.disabled = true);
            
            const isCorrect = options[idx] === wordObj.translation;
            if (isCorrect) {
                btn.classList.add('correct');
                showFeedback(true, wordObj);
            } else {
                btn.classList.add('wrong');
                // Acha o botão correto e destaca em verde
                buttons.forEach(b => {
                    if (b.textContent === wordObj.translation) b.classList.add('correct');
                });
                showFeedback(false, wordObj);
            }
        };
    });
}

// 2. Digitação / Ortografia (Spelling)
function setupSpellingQuestion(wordObj) {
    const container = document.getElementById('q-spelling');
    container.classList.remove('hide');
    
    document.getElementById('sp-translation-text').textContent = wordObj.translation;
    
    const input = document.getElementById('sp-input');
    input.value = '';
    input.disabled = false;
    input.className = 'glass-input';
    
    const submitBtn = document.getElementById('sp-btn-submit');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verificar';
    
    // Configura áudio auxiliar
    document.getElementById('sp-audio-btn').onclick = () => speakText(wordObj.word);
    
    const checkSpelling = () => {
        const val = input.value.trim().toLowerCase();
        if (!val) return;
        
        input.disabled = true;
        submitBtn.disabled = true;
        
        const isCorrect = val === wordObj.word.toLowerCase();
        if (isCorrect) {
            input.classList.add('correct');
            showFeedback(true, wordObj);
        } else {
            input.classList.add('wrong');
            showFeedback(false, wordObj, `Resposta certa: ${wordObj.word}`);
        }
    };
    
    submitBtn.onclick = checkSpelling;
    
    // Permitir enviar com Enter
    input.onkeydown = (e) => {
        if (e.key === 'Enter') checkSpelling();
    };
}

// 3. Completar Sentença (Cloze)
function setupClozeQuestion(wordObj) {
    const container = document.getElementById('q-cloze');
    container.classList.remove('hide');
    
    // Substitui a palavra do exemplo por lacunas (mantém sensibilidade a maiúsculas)
    const regex = new RegExp(`\\b${wordObj.word}\\b`, 'i');
    const clozeText = wordObj.example.replace(regex, '_______');
    
    document.getElementById('cloze-sentence-text').innerHTML = clozeText.replace('_______', `<span class="cloze-blank">_______</span>`);
    document.getElementById('cloze-translation-text').textContent = `Tradução: ${wordObj.exampleTranslation}`;
    
    // Opções
    const distractors = getRandomDistractors(wordObj.id, 3, true); // Distratores em inglês
    const options = [wordObj.word, ...distractors].sort(() => 0.5 - Math.random());
    
    const optionsContainer = document.getElementById('cloze-options');
    optionsContainer.innerHTML = '';
    
    options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'option-btn glass';
        btn.textContent = option;
        
        btn.onclick = () => {
            // Desabilita botões
            optionsContainer.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
            
            const isCorrect = option.toLowerCase() === wordObj.word.toLowerCase();
            if (isCorrect) {
                btn.classList.add('correct');
                // Revela a palavra no texto
                document.querySelector('.cloze-blank').textContent = wordObj.word;
                document.querySelector('.cloze-blank').style.color = 'var(--success)';
                showFeedback(true, wordObj);
            } else {
                btn.classList.add('wrong');
                // Destaca a correta
                optionsContainer.querySelectorAll('.option-btn').forEach(b => {
                    if (b.textContent.toLowerCase() === wordObj.word.toLowerCase()) {
                        b.classList.add('correct');
                    }
                });
                showFeedback(false, wordObj);
            }
        };
        
        optionsContainer.appendChild(btn);
    });
}

// Gerar palavras aleatórias da base para as opções erradas
function getRandomDistractors(wordId, count, english = false) {
    const list = [];
    while (list.length < count) {
        const rand = words[Math.floor(Math.random() * words.length)];
        if (rand.id !== wordId && !list.includes(english ? rand.word : rand.translation)) {
            list.push(english ? rand.word : rand.translation);
        }
    }
    return list;
}

// Exibir banner de feedback visual
function showFeedback(isCorrect, wordObj, msgOverride = '') {
    const banner = document.getElementById('feedback-banner');
    const icon = document.getElementById('feedback-icon');
    const title = document.getElementById('feedback-title');
    const desc = document.getElementById('feedback-desc');
    
    banner.classList.remove('hide');
    
    if (isCorrect) {
        banner.className = 'feedback-banner correct-banner';
        icon.textContent = '✔';
        title.textContent = 'Correto!';
        desc.textContent = msgOverride || 'Muito bem! Continue assim.';
        currentSession.correctCount++;
    } else {
        banner.className = 'feedback-banner wrong-banner';
        icon.textContent = '❌';
        title.textContent = 'Incorreto';
        desc.textContent = msgOverride || `Tradução: ${wordObj.translation}`;
        
        // Adiciona a palavra na lista de dificuldades da sessão
        currentSession.struggledAdded.push(wordObj.id);
    }
    
    // Toca a pronúncia da palavra como feedback sonoro adicional
    speakText(wordObj.word);
}

function handleExerciseNext() {
    const session = currentSession;
    if (session.currentIndex === session.words.length - 1) {
        // Fim da rodada de exercícios, mostra relatório
        showScoreReport();
    } else {
        session.currentIndex++;
        generateExerciseQuestion();
    }
}

// --- RELATÓRIO DE PONTUAÇÃO (SCORE) ---
function showScoreReport() {
    const session = currentSession;
    const percent = Math.round((session.correctCount / session.words.length) * 100);
    
    switchView('score');
    
    document.getElementById('score-day-label').textContent = `Resultados dos exercícios do Dia ${state.currentDay}`;
    document.getElementById('score-percent').textContent = `${percent}%`;
    document.getElementById('score-ratio').textContent = `${session.correctCount} de ${session.words.length} corretas`;
    
    // Desenha o círculo de progresso
    const ring = document.getElementById('score-ring');
    const radius = ring.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percent / 100) * circumference;
    ring.style.strokeDashoffset = offset;
    
    // Nota e estrelas
    const starsSpan = document.getElementById('score-stars');
    const msgPara = document.getElementById('score-msg');
    const continueBtn = document.getElementById('score-btn-continue');
    
    if (percent >= 90) {
        starsSpan.textContent = '⭐⭐⭐';
        msgPara.textContent = 'Fantástico! Desempenho perfeito!';
        msgPara.style.color = 'var(--success)';
        continueBtn.textContent = 'Avançar e Salvar';
        continueBtn.className = 'btn btn-secondary btn-glow';
    } else if (percent >= 70) {
        starsSpan.textContent = '⭐⭐';
        msgPara.textContent = 'Muito bom! Você passou.';
        msgPara.style.color = 'var(--secondary)';
        continueBtn.textContent = 'Avançar e Salvar';
        continueBtn.className = 'btn btn-secondary btn-glow';
    } else {
        starsSpan.textContent = '⭐';
        msgPara.textContent = 'Você não alcançou a nota mínima de 70%. Tente novamente para liberar o próximo dia!';
        msgPara.style.color = 'var(--danger)';
        continueBtn.textContent = 'Tentar Novamente';
        continueBtn.className = 'btn btn-danger';
    }
    
    // Atualizar ações dos botões
    document.getElementById('score-btn-retry').onclick = () => {
        startExerciseSession(state.currentDay);
    };
    
    continueBtn.onclick = () => {
        if (percent >= 70) {
            // Salvar no progresso
            state.scoreHistory[state.currentDay] = percent;
            
            // Se for o dia atual que estava bloqueando o avanço
            if (state.currentDay === state.maxUnlockedDay) {
                state.lastCompletedDay = state.currentDay;
                state.maxUnlockedDay = state.currentDay + 1;
                state.reviewCompletedToday = false; // Exige revisão no dia seguinte
                
                // Atualizar streak (ofensiva)
                const today = new Date().toDateString();
                state.lastActiveDate = today;
                state.streak++;
            }
            
            // Adicionar palavras que errou no banco de dificuldades permanente
            session.struggledAdded.forEach(id => {
                if (!state.struggledWords.includes(id)) {
                    state.struggledWords.push(id);
                }
            });
            
            saveProgress();
            switchView('dashboard');
        } else {
            // Nota baixa, refaz
            startExerciseSession(state.currentDay);
        }
    };
}

// --- CONTROLLER DA TELA DE PROGRESSE / ESTATÍSTICAS ---
function renderStatsUI() {
    const totalWords = words.length;
    const completedCount = state.lastCompletedDay;
    const percent = Math.round((completedCount / TOTAL_DAYS) * 100);
    
    // Círculo geral
    document.getElementById('stats-overall-percent').textContent = `${percent}%`;
    const ring = document.getElementById('stats-overall-ring');
    const radius = ring.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percent / 100) * circumference;
    ring.style.strokeDashoffset = offset;
    
    // Métricas detalhadas
    document.getElementById('stats-completed-days').textContent = `${completedCount} / ${TOTAL_DAYS}`;
    document.getElementById('stats-words-to-review').textContent = state.struggledWords.length;
    
    // Ofensiva máxima (calculada com base no streak atual ou persistido)
    document.getElementById('stats-longest-streak').textContent = `${state.streak} dias`;
    
    // Nota média
    const scores = Object.values(state.scoreHistory);
    if (scores.length > 0) {
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        document.getElementById('stats-avg-score-large').textContent = `${avg}%`;
    } else {
        document.getElementById('stats-avg-score-large').textContent = `--%`;
    }
    
    // Renderizar palavras difíceis
    const container = document.getElementById('struggled-words-container');
    container.innerHTML = '';
    
    if (state.struggledWords.length === 0) {
        container.innerHTML = '<p class="empty-list-msg">Excelente! Você não tem palavras marcadas com dificuldade.</p>';
        return;
    }
    
    state.struggledWords.forEach(id => {
        const wordObj = words.find(w => w.id === id);
        if (!wordObj) return;
        
        const badge = document.createElement('div');
        badge.className = 'struggled-word-badge';
        badge.innerHTML = `
            <span>${wordObj.word} (${wordObj.translation})</span>
            <span class="struggled-word-sound-icon">🔊</span>
            <span style="color:var(--danger); font-weight:bold; margin-left:5px;">×</span>
        `;
        
        // Ouvir áudio ao clicar no badge
        badge.addEventListener('click', (e) => {
            // Se clicar no '×', remove da lista
            if (e.target.textContent === '×') {
                e.stopPropagation();
                removeStruggledWord(id);
            } else {
                speakText(wordObj.word);
            }
        });
        
        container.appendChild(badge);
    });
}

function removeStruggledWord(id) {
    const idx = state.struggledWords.indexOf(id);
    if (idx > -1) {
        state.struggledWords.splice(idx, 1);
        saveProgress();
        renderStatsUI();
    }
}

// --- EVENT LISTENERS E ADMIN MODS ---
function registerEventListeners() {
    // Cliques na navbar
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view === 'study') {
                startStudySession(state.currentDay);
            } else if (view === 'review') {
                startReviewSession(state.maxUnlockedDay - 1);
            } else {
                switchView(view);
            }
        });
    });

    // Botoes Voltar
    document.getElementById('study-btn-back').onclick = () => switchView('dashboard');
    document.getElementById('review-btn-back').onclick = () => switchView('dashboard');
    document.getElementById('exercise-btn-back').onclick = () => switchView('dashboard');

    // Módulo de Estudo
    document.getElementById('study-btn-reveal').onclick = () => {
        document.getElementById('flashcard').classList.add('flipped');
        document.querySelector('#study-view .card-back').classList.remove('hide');
    };
    
    // Tocar áudio das palavras na lição
    document.getElementById('study-play-word').onclick = (e) => {
        e.stopPropagation();
        const word = currentSession.words[currentSession.currentIndex].word;
        speakText(word);
    };
    document.getElementById('study-play-word-back').onclick = (e) => {
        e.stopPropagation();
        const word = currentSession.words[currentSession.currentIndex].word;
        speakText(word);
    };
    document.getElementById('study-play-example').onclick = (e) => {
        e.stopPropagation();
        const example = currentSession.words[currentSession.currentIndex].example;
        speakText(example);
    };

    document.getElementById('study-btn-next').onclick = handleStudyNext;
    document.getElementById('study-btn-prev').onclick = handleStudyPrev;

    // Módulo de Revisão
    document.getElementById('review-btn-reveal').onclick = handleReviewReveal;
    document.getElementById('review-play-word').onclick = (e) => {
        e.stopPropagation();
        const word = currentSession.words[currentSession.currentIndex].word;
        speakText(word);
    };
    document.getElementById('review-play-word-back').onclick = (e) => {
        e.stopPropagation();
        const word = currentSession.words[currentSession.currentIndex].word;
        speakText(word);
    };
    document.getElementById('review-play-example').onclick = (e) => {
        e.stopPropagation();
        const example = currentSession.words[currentSession.currentIndex].example;
        speakText(example);
    };
    document.getElementById('review-btn-forgot').onclick = () => handleReviewFeedback(false);
    document.getElementById('review-btn-remembered').onclick = () => handleReviewFeedback(true);

    // Módulo de Exercício
    document.getElementById('feedback-btn-next').onclick = handleExerciseNext;

    // Área Administrativa / Testes
    document.getElementById('stats-btn-reset').onclick = () => {
        if (confirm("Tem certeza absoluta de que deseja redefinir todo o seu progresso? Esta ação não pode ser desfeita.")) {
            localStorage.removeItem('nowenglish_progress');
            localStorage.removeItem('nowenglish_progress_updated_at');
            state = {
                currentDay: 1,
                maxUnlockedDay: 1,
                lastCompletedDay: 0,
                streak: 0,
                lastActiveDate: null,
                scoreHistory: {},
                struggledWords: [],
                reviewCompletedToday: false
            };
            saveProgress();
            switchView('dashboard');
        }
    };

    document.getElementById('stats-btn-mock-days').onclick = () => {
        let isAutomated = false;
        let inputVal = prompt("Até qual dia você deseja simular como CONCLUÍDO? (1 a 90):", "5");
        if (inputVal === null || inputVal.trim() === "") {
            inputVal = "5";
            isAutomated = true;
        }
        const daysToMock = parseInt(inputVal);
        if (isNaN(daysToMock) || daysToMock < 1 || daysToMock > 90) {
            if (!isAutomated) alert("Número de dias inválido!");
            return;
        }
        
        // Simular progresso
        state.lastCompletedDay = daysToMock;
        state.maxUnlockedDay = daysToMock + 1;
        state.currentDay = daysToMock + 1;
        state.streak = daysToMock;
        state.lastActiveDate = new Date().toDateString();
        state.reviewCompletedToday = false;
        
        // Simular notas aleatórias entre 70% e 100%
        for (let d = 1; d <= daysToMock; d++) {
            state.scoreHistory[d] = 70 + Math.floor(Math.random() * 31);
        }
        
        saveProgress();
        if (!isAutomated) {
            alert(`Sucesso! Dias 1 a ${daysToMock} foram marcados como concluídos com notas simuladas.`);
        } else {
            console.log(`Sucesso! Simulação de dias 1 a ${daysToMock} concluída via automação.`);
        }
        switchView('dashboard');
    };
}
