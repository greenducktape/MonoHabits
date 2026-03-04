async function testAddHabit() {
  try {
    const res = await fetch('http://localhost:3000/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Habit', frequency: 'daily' })
    });
    const data = await res.json();
    console.log('Add Habit Response:', data);
    
    const habitsRes = await fetch('http://localhost:3000/api/habits');
    const habitsData = await habitsRes.json();
    console.log('All Habits:', habitsData);
  } catch (e) {
    console.error('Test failed:', e);
  }
}
testAddHabit();
