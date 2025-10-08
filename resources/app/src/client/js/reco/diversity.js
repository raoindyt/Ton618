// Advanced diversity algorithms for better recommendation spread

import { tokenize } from './engine.js';
import { detectGenreFromText } from './genres.js';

// Calculate semantic similarity between tracks
export function semanticSimilarity(trackA, trackB) {
    const tokensA = new Set(tokenize(`${trackA.title} ${trackA.artist}`));
    const tokensB = new Set(tokenize(`${trackB.title} ${trackB.artist}`));

    if (tokensA.size === 0 && tokensB.size === 0) return 0;

    let intersection = 0;
    for (const token of tokensA) {
        if (tokensB.has(token)) intersection++;
    }

    const union = tokensA.size + tokensB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

// Calculate genre diversity
export function genreSimilarity(trackA, trackB) {
    const genresA = new Set(detectGenreFromText(`${trackA.title} ${trackA.artist}`));
    const genresB = new Set(detectGenreFromText(`${trackB.title} ${trackB.artist}`));

    if (genresA.size === 0 && genresB.size === 0) return 0;

    let intersection = 0;
    for (const genre of genresA) {
        if (genresB.has(genre)) intersection++;
    }

    const union = genresA.size + genresB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

// Calculate artist similarity (same artist = 1.0, similar names = partial)
export function artistSimilarity(trackA, trackB) {
    const artistA = (trackA.artist || '').toLowerCase().trim();
    const artistB = (trackB.artist || '').toLowerCase().trim();

    if (!artistA || !artistB) return 0;
    if (artistA === artistB) return 1.0;

    // Check for partial matches (featuring, collaborations)
    if (artistA.includes(artistB) || artistB.includes(artistA)) return 0.7;

    // Levenshtein distance for similar artist names
    const distance = levenshteinDistance(artistA, artistB);
    const maxLen = Math.max(artistA.length, artistB.length);
    return maxLen > 0 ? Math.max(0, 1 - distance / maxLen) : 0;
}

// Combined similarity score
export function trackSimilarity(trackA, trackB) {
    const semantic = semanticSimilarity(trackA, trackB);
    const genre = genreSimilarity(trackA, trackB);
    const artist = artistSimilarity(trackA, trackB);

    // Weighted combination - artist similarity has highest impact
    return artist * 0.5 + semantic * 0.3 + genre * 0.2;
}

// Maximal Marginal Relevance algorithm for diverse selection
export function selectDiverseItems(candidates, limit, lambda = 0.6) {
    if (!candidates.length) return [];

    const selected = [];
    const remaining = [...candidates];

    // Select first item (highest score)
    remaining.sort((a, b) => b.score - a.score);
    selected.push(remaining.shift());

    while (selected.length < limit && remaining.length > 0) {
        let bestIdx = 0;
        let bestValue = -Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];

            // Calculate maximum similarity to already selected items
            let maxSimilarity = 0;
            for (const selectedItem of selected) {
                const similarity = trackSimilarity(candidate, selectedItem);
                maxSimilarity = Math.max(maxSimilarity, similarity);
            }

            // MMR formula: λ * relevance - (1-λ) * max_similarity
            const mmrValue = lambda * candidate.score - (1 - lambda) * maxSimilarity;

            if (mmrValue > bestValue) {
                bestValue = mmrValue;
                bestIdx = i;
            }
        }

        selected.push(remaining.splice(bestIdx, 1)[0]);
    }

    return selected;
}

// Simple Levenshtein distance implementation
function levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}