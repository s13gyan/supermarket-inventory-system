const loginForm = document.getElementById('login-form');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const button = document.getElementById('login-button');
    const errorMessage = document.getElementById('login-error');
    button.disabled = true;
    errorMessage.textContent = '';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: document.getElementById('identifier').value,
                password: document.getElementById('password').value
            })
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Sign in failed');
        }

        window.location.assign('/');
    } catch (error) {
        errorMessage.textContent = error.message;
        button.disabled = false;
    }
});
