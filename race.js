// Fires two simultaneous "convert note to task" requests against a
// running local backend, to prove the atomic-write guard actually
// holds under a real race — not just "looks right in the code."
//
// Usage: node race_test.js <BASE_URL> <ACCESS_TOKEN>
// Example: node race_test.js http://localhost:4000/api eyJhbGciOi...

const BASE_URL = process.argv[2];
const TOKEN = process.argv[3];

if (!BASE_URL || !TOKEN) {
    console.error('Usage: node race_test.js <BASE_URL> <ACCESS_TOKEN>');
    process.exit(1);
}

async function apiFetch(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TOKEN}`,
            ...options.headers,
        },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
}

async function main() {
    console.log('1. Creating a note...');
    const { status: createStatus, body: createBody } = await apiFetch('/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'Race condition test note ' + Date.now() }),
    });
    if (createStatus !== 201) {
        console.error('Failed to create note:', createStatus, createBody);
        process.exit(1);
    }
    const noteId = createBody.note.id;
    console.log(`   Created note: ${noteId}`);

    console.log('\n2. Firing TWO simultaneous convert requests...');
    const [r1, r2] = await Promise.all([
        apiFetch(`/notes/${noteId}/convert`, { method: 'POST' }),
        apiFetch(`/notes/${noteId}/convert`, { method: 'POST' }),
    ]);

    console.log('   Request A:', r1.status, JSON.stringify(r1.body));
    console.log('   Request B:', r2.status, JSON.stringify(r2.body));

    const successes = [r1, r2].filter((r) => r.status === 201);
    const conflicts = [r1, r2].filter((r) => r.status === 409);

    console.log(`\n3. Result: ${successes.length} succeeded (201), ${conflicts.length} conflicted (409)`);

    if (successes.length !== 1) {
        console.error(`   FAIL — expected exactly 1 success, got ${successes.length}. The race guard did not hold.`);
        process.exit(1);
    }

    console.log('   PASS — exactly one request created a task, the other correctly detected the race and backed off.');

    console.log('\n4. Verifying only ONE task exists tied to this conversion...');
    const winningTaskId = successes[0].body.task.id;
    const { status: getStatus, body: getBody } = await apiFetch(`/tasks/${winningTaskId}`);
    console.log(`   GET /tasks/${winningTaskId} -> ${getStatus}`);
    if (getStatus === 200) {
        console.log('   PASS — the winning task exists and is reachable.');
    } else {
        console.error('   FAIL — winning task not found?!');
        process.exit(1);
    }

    console.log('\n5. Confirming the losing request did NOT leave an orphan task behind is harder to fully verify via API');
    console.log('   (no "list all tasks created from this note" endpoint) — but the hard-delete-on-loss logic in the');
    console.log('   controller means the loser\'s task was deleted immediately after creation. Spot-check manually if needed:');
    console.log(`   SELECT * FROM tasks WHERE profile_id = '<your_profile_id>' AND title LIKE 'Race condition test note%';`);
    console.log('   Should return exactly 1 row.');
}

main().catch((err) => {
    console.error('Test crashed:', err);
    process.exit(1);
});