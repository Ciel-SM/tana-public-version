const DIMS = 3072;
export class VectorIndex {
    constructor() {
        this.ids = [];
        this.vectors = new Float32Array(0);
        this.count = 0;
    }
    add(id, vector) {
        if (vector.length !== DIMS) {
            throw new Error(`Expected ${DIMS}-dim vector, got ${vector.length}`);
        }
        // Check if id already exists — replace in-place
        const existingIdx = this.ids.indexOf(id);
        if (existingIdx !== -1) {
            this.vectors.set(vector, existingIdx * DIMS);
            return;
        }
        // Grow buffer if needed
        const neededLen = (this.count + 1) * DIMS;
        if (neededLen > this.vectors.length) {
            const newCapacity = Math.max(neededLen, this.vectors.length * 2 || DIMS * 64);
            const newVectors = new Float32Array(newCapacity);
            newVectors.set(this.vectors);
            this.vectors = newVectors;
        }
        this.vectors.set(vector, this.count * DIMS);
        this.ids.push(id);
        this.count++;
    }
    remove(id) {
        const idx = this.ids.indexOf(id);
        if (idx === -1)
            return false;
        // Move last element into the gap
        const lastIdx = this.count - 1;
        if (idx !== lastIdx) {
            const lastOffset = lastIdx * DIMS;
            const removeOffset = idx * DIMS;
            this.vectors.copyWithin(removeOffset, lastOffset, lastOffset + DIMS);
            this.ids[idx] = this.ids[lastIdx];
        }
        this.ids.pop();
        this.count--;
        return true;
    }
    search(query, topK) {
        if (query.length !== DIMS) {
            throw new Error(`Expected ${DIMS}-dim query, got ${query.length}`);
        }
        if (this.count === 0)
            return [];
        // Precompute query norm
        let queryNorm = 0;
        for (let i = 0; i < DIMS; i++) {
            queryNorm += query[i] * query[i];
        }
        queryNorm = Math.sqrt(queryNorm);
        if (queryNorm === 0)
            return [];
        // Brute-force cosine similarity
        const results = [];
        for (let n = 0; n < this.count; n++) {
            const offset = n * DIMS;
            let dot = 0;
            let vecNorm = 0;
            for (let i = 0; i < DIMS; i++) {
                const v = this.vectors[offset + i];
                dot += query[i] * v;
                vecNorm += v * v;
            }
            vecNorm = Math.sqrt(vecNorm);
            if (vecNorm === 0)
                continue;
            const similarity = dot / (queryNorm * vecNorm);
            results.push({ id: this.ids[n], similarity });
        }
        results.sort((a, b) => b.similarity - a.similarity);
        return results.slice(0, topK);
    }
    loadFromRecords(records) {
        this.ids = [];
        this.count = 0;
        this.vectors = new Float32Array(records.length * DIMS);
        for (const record of records) {
            if (record.embedding.length !== DIMS)
                continue;
            this.vectors.set(record.embedding, this.count * DIMS);
            this.ids.push(record.id);
            this.count++;
        }
    }
    get size() {
        return this.count;
    }
    clear() {
        this.ids = [];
        this.vectors = new Float32Array(0);
        this.count = 0;
    }
}
