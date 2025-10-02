class WordleSolver {
    constructor(possibleAnswers, allowedGuesses) {
        this.possibleAnswers = possibleAnswers;
        this.allowedGuesses = allowedGuesses;
        this.reset();
    }

    reset() {
        this.remainingAnswers = [...this.possibleAnswers];
    }

    getPattern(guess, answer) {
        const pattern = Array(5).fill('b');
        const answerChars = answer.split('');
        const guessChars = guess.split('');
        const answerCounts = {};
        answerChars.forEach(c => answerCounts[c] = (answerCounts[c] || 0) + 1);

        // 1. Mark greens and update remaining counts in answerCounts
        for (let i = 0; i < 5; i++) {
            if (guessChars[i] === answerChars[i]) {
                pattern[i] = 'g';
                answerCounts[guessChars[i]]--;
            }
        }

        // 2. Mark yellows
        for (let i = 0; i < 5; i++) {
            if (pattern[i] === 'g') continue;
            
            const char = guessChars[i];
            if (answerChars.includes(char) && answerCounts[char] > 0) {
                pattern[i] = 'y';
                answerCounts[char]--;
            }
        }

        return pattern.join('');
    }

    filterWords(guess, pattern) {
        this.remainingAnswers = this.remainingAnswers.filter(answer => {
            return this.getPattern(guess, answer) === pattern;
        });
    }

    calculateEntropies(topN = 10) {
        const candidates = this.remainingAnswers.length <= 2 
            ? this.remainingAnswers 
            : this.allowedGuesses;

        const entropies = candidates.map(guess => {
            const patternCounts = {};
            
            for (const answer of this.remainingAnswers) {
                const pattern = this.getPattern(guess, answer);
                patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
            }

            let entropy = 0;
            const total = this.remainingAnswers.length;
            
            for (const count of Object.values(patternCounts)) {
                const p = count / total;
                if (p > 0) {
                    entropy -= p * Math.log2(p);
                }
            }

            const isPossibleAnswer = this.remainingAnswers.includes(guess);

            return { word: guess, entropy, isPossibleAnswer };
        });

        entropies.sort((a, b) => {
            if (b.entropy !== a.entropy) {
                return b.entropy - a.entropy;
            }
            return b.isPossibleAnswer - a.isPossibleAnswer;
        });

        return entropies.slice(0, topN);
    }
}

let solver;
let guesses = [];
let currentPattern = ['b', 'b', 'b', 'b', 'b'];


async function loadWordLists() {
    try {
        // --- PATH FIX: Changed '/data/' to './data/' for relative loading on GitHub Pages ---
        const [answersRes, guessesRes] = await Promise.all([
            fetch('./data/possible_answers.txt'),
            fetch('./data/allowed_guesses.txt')
        ]);

        if (!answersRes.ok || !guessesRes.ok) {
            throw new Error('Word list files could not be found or loaded.');
        }

        const answersText = await answersRes.text();
        const guessesText = await guessesRes.text();
        
        const parseWords = (text) => text.trim().split('\n')
            .map(line => line.trim().toUpperCase())
            .filter(word => word.length === 5 && /^[A-Z]+$/.test(word));

        const possibleAnswers = parseWords(answersText);
        const allowedGuesses = parseWords(guessesText);
        
        if (possibleAnswers.length === 0) {
            throw new Error("No valid possible answers loaded.");
        }

        const allAllowedWords = [...new Set([...possibleAnswers, ...allowedGuesses])];

        solver = new WordleSolver(possibleAnswers, allAllowedWords);
        
        calculateRecommendations(10);
        
        const listEl = document.getElementById('recommendationsList');
        if (listEl.querySelector('.empty-state')) {
             listEl.innerHTML = '';
        }

    } catch (error) {
        console.error('Error loading word lists:', error);
        document.getElementById('recommendationsList').innerHTML = 
            '<div class="empty-state" style="color: red;">ERROR: Failed to load word lists. Please ensure files are in **`/data/`** and you are using a **local web server**.</div>';
    }
}

function initializePatternButtons() {
    const buttons = document.querySelectorAll('.pattern-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            cyclePattern(index);
        });
    });
}

function cyclePattern(index) {
    const states = ['b', 'y', 'g'];
    const currentIndex = states.indexOf(currentPattern[index]);
    currentPattern[index] = states[(currentIndex + 1) % 3];
    updatePatternButtons();
}

function updatePatternButtons() {
    const buttons = document.querySelectorAll('.pattern-btn');
    buttons.forEach((btn, index) => {
        btn.className = 'pattern-btn';
        const state = currentPattern[index];
        if (state === 'b') btn.classList.add('gray');
        else if (state === 'y') btn.classList.add('yellow');
        else btn.classList.add('green');
        
        const guessInput = document.getElementById('guessInput').value.toUpperCase();
        btn.textContent = guessInput.length > index ? guessInput[index] : '_';
    });
}

function submitGuess() {
    const guessInput = document.getElementById('guessInput');
    const guess = guessInput.value.toUpperCase().trim();

    if (guess.length !== 5) {
        alert('Please enter a 5-letter word');
        return;
    }

    const pattern = currentPattern.join('');
    
    guesses.push({ word: guess, pattern });
    solver.filterWords(guess, pattern);
    
    updateGuessesHistory();
    calculateRecommendations(20);
    
    guessInput.value = '';
    currentPattern = ['b', 'b', 'b', 'b', 'b'];
    updatePatternButtons();
}

function calculateRecommendations(count = 20) {
    if (!solver) return;

    const recommendations = solver.calculateEntropies(count);
    const listEl = document.getElementById('recommendationsList');
    
    if (recommendations.length === 0 && solver.remainingAnswers.length > 0) {
        listEl.innerHTML = '<div class="empty-state">No recommendations available. Try a word from the remaining possible answers: ' + solver.remainingAnswers.slice(0, 10).join(', ') + '...</div>';
        return;
    } else if (recommendations.length === 0 && solver.remainingAnswers.length === 0) {
        listEl.innerHTML = '<div class="empty-state" style="color: green; font-weight: bold;">SOLVED! There are no possible words left.</div>';
        return;
    }

    listEl.innerHTML = recommendations.map(rec => {
        // Highlighting possible answers (the "green box" logic)
        const isAnswerClass = rec.isPossibleAnswer ? 'style="border: 2px solid #6aaa64; background: #e6ffed;"' : '';
        const answerLabel = rec.isPossibleAnswer ? ' (Ans)' : '';
        
        return `
            <div class="word-item" onclick="selectWord('${rec.word}')" ${isAnswerClass}>
                <div class="word">${rec.word}${answerLabel}</div>
                <div class="entropy">${rec.entropy.toFixed(3)} bits</div>
            </div>
        `;
    }).join('');
}

function selectWord(word) {
    document.getElementById('guessInput').value = word.toUpperCase();
    updatePatternButtons();
}

function updateGuessesHistory() {
    const historyEl = document.getElementById('guessesHistory');
    
    if (guesses.length === 0) {
        historyEl.innerHTML = '<div class="empty-state">No guesses yet</div>';
        return;
    }

    historyEl.innerHTML = guesses.map(guess => {
        const tiles = guess.word.split('').map((letter, i) => {
            const state = guess.pattern[i];
            const className = state === 'g' ? 'green' : state === 'y' ? 'yellow' : 'gray';
            return `<div class="tile ${className}">${letter}</div>`;
        }).join('');
        return `<div class="guess-item">${tiles}</div>`;
    }).join('');
}

function resetSolver() {
    guesses = [];
    currentPattern = ['b', 'b', 'b', 'b', 'b'];
    solver.reset();
    updateGuessesHistory();
    calculateRecommendations(10);
    updatePatternButtons();
    document.getElementById('guessInput').value = '';
}

// Event Listeners
document.getElementById('submitBtn').addEventListener('click', submitGuess);
document.getElementById('resetBtn').addEventListener('click', resetSolver);
document.getElementById('guessInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitGuess();
});
document.getElementById('guessInput').addEventListener('input', updatePatternButtons);

// Initial Setup
initializePatternButtons();
loadWordLists();
