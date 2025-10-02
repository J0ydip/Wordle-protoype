// Wordle Solver - Information Theory Implementation
const WORD_LENGTH = 5;
const TOP_N = 10;

let possibleAnswers = [];
let allowedGuesses = [];
let solver = null;
let guessHistory = [];

// Pattern state
let currentWord = '';
let currentPattern = ['b', 'b', 'b', 'b', 'b'];

// Load word lists on page load
window.addEventListener('DOMContentLoaded', async () => {
    await loadWordLists();
    initializePatternInput();
    setupEventListeners();
});

async function loadWordLists() {
    try {
        const [answersText, guessesText] = await Promise.all([
            fetch('possible_answers.txt').then(r => r.text()),
            fetch('allowed_guesses.txt').then(r => r.text())
        ]);

        possibleAnswers = answersText.split('\n')
            .map(w => w.trim().toLowerCase())
            .filter(w => w.length === WORD_LENGTH);

        const guessWords = guessesText.split('\n')
            .map(w => w.trim().toLowerCase())
            .filter(w => w.length === WORD_LENGTH);

        allowedGuesses = [...new Set([...possibleAnswers, ...guessWords])].sort();

        solver = new WordleSolver(possibleAnswers, allowedGuesses);
        
        // Calculate initial recommendations
        await calculateAndDisplayRecommendations();
    } catch (error) {
        console.error('Error loading word lists:', error);
        document.getElementById('recommendations').innerHTML = 
            '<div class="empty-state">Error loading word lists. Please refresh the page.</div>';
    }
}

function setupEventListeners() {
    const input = document.getElementById('wordInput');
    input.addEventListener('input', (e) => {
        currentWord = e.target.value.toLowerCase().slice(0, WORD_LENGTH);
        e.target.value = currentWord.toUpperCase();
        updatePatternInput();
        clearError();
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && currentWord.length === WORD_LENGTH) {
            submitGuess();
        }
    });
}

function initializePatternInput() {
    const container = document.getElementById('patternInput');
    for (let i = 0; i < WORD_LENGTH; i++) {
        const box = document.createElement('div');
        box.className = 'pattern-box gray disabled';
        box.dataset.index = i;
        box.onclick = () => togglePattern(i);
        container.appendChild(box);
    }
}

function updatePatternInput() {
    const boxes = document.querySelectorAll('.pattern-box');
    boxes.forEach((box, i) => {
        const letter = currentWord[i] || '';
        box.textContent = letter.toUpperCase();
        
        if (letter) {
            box.classList.remove('disabled');
        } else {
            box.classList.add('disabled');
            currentPattern[i] = 'b';
        }
        
        // Update color
        box.className = `pattern-box ${currentPattern[i] === 'g' ? 'green' : 
                        currentPattern[i] === 'y' ? 'yellow' : 'gray'}`;
        if (!letter) box.classList.add('disabled');
    });
}

function togglePattern(index) {
    if (!currentWord[index]) return;
    
    const states = ['b', 'y', 'g'];
    const currentIndex = states.indexOf(currentPattern[index]);
    currentPattern[index] = states[(currentIndex + 1) % states.length];
    
    updatePatternInput();
}

function clearError() {
    document.getElementById('wordError').textContent = '';
}

function showError(message) {
    document.getElementById('wordError').textContent = message;
}

async function submitGuess() {
    clearError();
    
    if (currentWord.length !== WORD_LENGTH) {
        showError(`Word must be ${WORD_LENGTH} letters`);
        return;
    }

    if (!allowedGuesses.includes(currentWord)) {
        showError('Not a valid word');
        return;
    }

    const pattern = currentPattern.join('');
    
    // Check if won
    if (pattern === 'ggggg') {
        guessHistory.push({ word: currentWord, pattern });
        displayGuessHistory();
        const guessCount = guessHistory.length;
        document.getElementById('recommendations').innerHTML = 
            `<div class="empty-state" style="background: #d4edda; padding: 30px; border-radius: 8px;">
                <h3 style="color: #155724; margin-bottom: 10px;">🎉 Congratulations!</h3>
                <p style="color: #155724;">You solved it in ${guessCount} ${guessCount === 1 ? 'guess' : 'guesses'}!</p>
            </div>`;
        document.getElementById('submitBtn').disabled = true;
        document.getElementById('wordInput').disabled = true;
        return;
    }

    // Update solver
    const remaining = solver.filterWords(currentWord, pattern);
    guessHistory.push({ word: currentWord, pattern });
    
    // Reset input
    currentWord = '';
    currentPattern = ['b', 'b', 'b', 'b', 'b'];
    document.getElementById('wordInput').value = '';
    updatePatternInput();
    
    // Update display
    displayGuessHistory();
    document.getElementById('resetBtn').disabled = false;
    
    if (remaining === 0) {
        document.getElementById('recommendations').innerHTML = 
            '<div class="empty-state">No possible answers found. The word might not be in the dictionary.</div>';
    } else {
        await calculateAndDisplayRecommendations();
    }
}

function displayGuessHistory() {
    const container = document.getElementById('guessHistory');
    
    if (guessHistory.length === 0) {
        container.innerHTML = '<div class="empty-state">No guesses yet. Enter your first guess below.</div>';
        return;
    }

    container.innerHTML = '';
    guessHistory.forEach(guess => {
        const row = document.createElement('div');
        row.className = 'guess-row';
        
        for (let i = 0; i < WORD_LENGTH; i++) {
            const box = document.createElement('div');
            box.className = `letter-box ${guess.pattern[i] === 'g' ? 'green' : 
                            guess.pattern[i] === 'y' ? 'yellow' : 'gray'}`;
            box.textContent = guess.word[i].toUpperCase();
            row.appendChild(box);
        }
        
        container.appendChild(row);
    });
}

async function calculateAndDisplayRecommendations() {
    const container = document.getElementById('recommendations');
    const remaining = solver.getPossibleAnswersCount();
    
    container.innerHTML = `
        <div class="rec-header">
            <h3 style="margin: 0;">Top Recommendations</h3>
            <span class="badge">${remaining} possible ${remaining === 1 ? 'answer' : 'answers'}</span>
        </div>
        <div class="loading">
            <p>Calculating entropies...</p>
            <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width: 0%"></div></div>
            <p id="progressText" style="margin-top: 8px; font-size: 0.875rem; color: #6c757d;">0 / ${allowedGuesses.length}</p>
        </div>
    `;

    // Use setTimeout to allow UI to update
    setTimeout(async () => {
        const results = await solver.calculateEntropies((current, total) => {
            const percent = Math.round((current / total) * 100);
            const fill = document.getElementById('progressFill');
            const text = document.getElementById('progressText');
            if (fill) fill.style.width = percent + '%';
            if (text) text.textContent = `${current} / ${total} (${percent}%)`;
        });

        displayRecommendations(results, remaining);
    }, 100);
}

function displayRecommendations(results, remaining) {
    const container = document.getElementById('recommendations');
    
    if (remaining === 1) {
        const answer = results[0].word;
        container.innerHTML = `
            <div class="rec-header">
                <h3 style="margin: 0;">Top Recommendations</h3>
                <span class="badge">${remaining} possible answer</span>
            </div>
            <div style="background: #d4edda; border: 2px solid #6aaa64; border-radius: 8px; padding: 30px; text-align: center;">
                <p style="font-size: 1.2rem; font-weight: bold; color: #155724; margin-bottom: 8px;">Answer found!</p>
                <p style="font-size: 2rem; font-weight: bold; text-transform: uppercase; letter-spacing: 3px; color: #155724;">${answer}</p>
            </div>
        `;
        return;
    }

    const topResults = results.slice(0, TOP_N);
    
    let html = `
        <div class="rec-header">
            <h3 style="margin: 0;">Top Recommendations</h3>
            <span class="badge">${remaining} possible answers</span>
        </div>
    `;

    topResults.forEach((rec, index) => {
        const probPercent = (rec.probability * 100).toFixed(2);
        html += `
            <div class="rec-item ${rec.isPossibleAnswer ? 'highlight' : ''}">
                <div class="rec-left">
                    <div class="rec-rank">#${index + 1}</div>
                    <div>
                        <div class="rec-word">${rec.word}</div>
                        <div class="rec-details">
                            Entropy: ${rec.entropy.toFixed(3)} bits
                            ${rec.isPossibleAnswer ? ` • P(${probPercent}%)` : ''}
                        </div>
                    </div>
                </div>
                ${rec.isPossibleAnswer ? '<span class="rec-badge">Possible Answer</span>' : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

function resetSolver() {
    solver = new WordleSolver(possibleAnswers, allowedGuesses);
    guessHistory = [];
    currentWord = '';
    currentPattern = ['b', 'b', 'b', 'b', 'b'];
    
    document.getElementById('wordInput').value = '';
    document.getElementById('wordInput').disabled = false;
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('resetBtn').disabled = true;
    
    updatePatternInput();
    displayGuessHistory();
    clearError();
    
    calculateAndDisplayRecommendations();
}

// Wordle Solver Class
class WordleSolver {
    constructor(possibleAnswers, allowedGuesses) {
        this.possibleAnswers = new Set(possibleAnswers);
        this.allowedGuesses = allowedGuesses;
        this.resetConstraints();
    }

    resetConstraints() {
        this.constraints = {
            greens: {},
            yellows: Array.from({ length: WORD_LENGTH }, () => new Set()),
            minCounts: {},
            maxCounts: {}
        };
    }

    countChars(word) {
        const counts = {};
        for (const char of word) {
            counts[char] = (counts[char] || 0) + 1;
        }
        return counts;
    }

    getPattern(guess, answer) {
        const pattern = Array(WORD_LENGTH).fill('');
        const answerCounts = this.countChars(answer);

        // First pass: greens
        for (let i = 0; i < WORD_LENGTH; i++) {
            if (guess[i] === answer[i]) {
                pattern[i] = 'g';
                answerCounts[guess[i]]--;
            }
        }

        // Second pass: yellows and blacks
        for (let i = 0; i < WORD_LENGTH; i++) {
            if (pattern[i] === '') {
                const char = guess[i];
                if (answerCounts[char] && answerCounts[char] > 0) {
                    pattern[i] = 'y';
                    answerCounts[char]--;
                } else {
                    pattern[i] = 'b';
                }
            }
        }

        return pattern.join('');
    }

    updateConstraints(guess, pattern) {
        // Count greens and yellows in this guess
        const currentGuessMinCounts = {};
        for (let i = 0; i < WORD_LENGTH; i++) {
            if (pattern[i] === 'g' || pattern[i] === 'y') {
                const char = guess[i];
                currentGuessMinCounts[char] = (currentGuessMinCounts[char] || 0) + 1;
            }
        }

        // Update minimum counts
        for (const [char, count] of Object.entries(currentGuessMinCounts)) {
            this.constraints.minCounts[char] = Math.max(
                this.constraints.minCounts[char] || 0,
                count
            );
        }

        // Process each position
        for (let i = 0; i < WORD_LENGTH; i++) {
            const char = guess[i];
            if (pattern[i] === 'g') {
                this.constraints.greens[i] = char;
            } else if (pattern[i] === 'y') {
                this.constraints.yellows[i].add(char);
            } else if (pattern[i] === 'b') {
                this.constraints.maxCounts[char] = currentGuessMinCounts[char] || 0;
            }
        }
    }

    isWordPossible(word) {
        const wordCounts = this.countChars(word);

        // Check greens
        for (const [pos, char] of Object.entries(this.constraints.greens)) {
            if (word[parseInt(pos)] !== char) {
                return false;
            }
        }

        // Check yellows
        for (let i = 0; i < WORD_LENGTH; i++) {
            if (this.constraints.yellows[i].has(word[i])) {
                return false;
            }
        }

        // Check min counts
        for (const [char, minCount] of Object.entries(this.constraints.minCounts)) {
            if ((wordCounts[char] || 0) < minCount) {
                return false;
            }
        }

        // Check max counts
        for (const [char, maxCount] of Object.entries(this.constraints.maxCounts)) {
            if ((wordCounts[char] || 0) > maxCount) {
                return false;
            }
        }

        return true;
    }

    filterWords(guess, pattern) {
        this.updateConstraints(guess, pattern);

        const newPossibleAnswers = new Set();
        for (const word of this.possibleAnswers) {
            if (this.isWordPossible(word)) {
                newPossibleAnswers.add(word);
            }
        }

        this.possibleAnswers = newPossibleAnswers;
        return this.possibleAnswers.size;
    }

    async calculateEntropies(onProgress) {
        const entropies = [];
        const totalPossible = this.possibleAnswers.size;

        if (totalPossible === 0) {
            return [];
        }

        for (let i = 0; i < this.allowedGuesses.length; i++) {
            const guess = this.allowedGuesses[i];
            
            if (i % 100 === 0 && onProgress) {
                onProgress(i, this.allowedGuesses.length);
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const patternCounts = {};
            for (const answer of this.possibleAnswers) {
                const pattern = this.getPattern(guess, answer);
                patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
            }

            let entropy = 0.0;
            for (const count of Object.values(patternCounts)) {
                const p = count / totalPossible;
                if (p > 0) {
                    entropy -= p * Math.log2(p);
                }
            }

            const isPossibleAnswer = this.possibleAnswers.has(guess);
            if (isPossibleAnswer) {
                entropy += 0.1;
            }

            const probability = isPossibleAnswer ? 1 / totalPossible : 0;

            entropies.push({
                word: guess,
                entropy,
                isPossibleAnswer,
                probability
            });
        }

        if (onProgress) {
            onProgress(this.allowedGuesses.length, this.allowedGuesses.length);
        }

        return entropies.sort((a, b) => b.entropy - a.entropy);
    }

    getPossibleAnswersCount() {
        return this.possibleAnswers.size;
    }

    getPossibleAnswers() {
        return Array.from(this.possibleAnswers).sort();
    }
}
