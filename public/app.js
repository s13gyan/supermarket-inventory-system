async function handleResponse(response) {
    if (response.status === 401) {
        window.location.assign('/login');
        throw new Error('Your session has ended. Please sign in again.');
    }

    if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'The request could not be completed');
    }

    return response;
}

async function loadDashboard() {
    try {
        const response = await handleResponse(await fetch('/api/dashboard'));
        const data = await response.json();

        document.getElementById('total-products').textContent = data.total_products;
        document.getElementById('total-stock').textContent = data.total_stock;
        document.getElementById('stock-value').textContent =
            `GH₵ ${Number(data.stock_value).toFixed(2)}`;
        document.getElementById('total-sales').textContent =
            `GH₵ ${Number(data.total_sales).toFixed(2)}`;
    } catch (error) {
        console.error('Dashboard error:', error.message);
    }
}

async function loadProducts() {
    try {
        const response = await handleResponse(await fetch('/api/products'));
        const products = await response.json();
        const table = document.getElementById('products-table');

        table.innerHTML = '';

        if (products.length === 0) {
            table.innerHTML = '<tr><td colspan="5">No products found</td></tr>';
            return;
        }

        products.forEach((product) => {
            const row = document.createElement('tr');
            const values = [
                product.name,
                product.sku,
                product.category || '-',
                `GH₵ ${Number(product.price).toFixed(2)}`,
                product.quantity
            ];

            values.forEach((value) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            });

            table.appendChild(row);
        });
    } catch (error) {
        console.error('Products error:', error.message);
    }
}

document.getElementById('product-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const product = {
        name: document.getElementById('name').value,
        sku: document.getElementById('sku').value,
        category: document.getElementById('category').value,
        price: Number(document.getElementById('price').value),
        quantity: Number(document.getElementById('quantity').value)
    };

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(product)
        });
        await handleResponse(response);

        alert('Product added successfully!');
        document.getElementById('product-form').reset();
        await Promise.all([loadProducts(), loadDashboard()]);
    } catch (error) {
        if (responseStatusIsUnauthorized(error)) return;
        alert(error.message);
    }
});

function responseStatusIsUnauthorized(error) {
    return error.message === 'Your session has ended. Please sign in again.';
}

document.getElementById('logout-button').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (!response.ok) throw new Error('Could not log out. Please try again.');
        window.location.assign('/login');
    } catch (error) {
        alert(error.message);
    }
});

async function initializeDashboard() {
    try {
        const response = await handleResponse(await fetch('/api/auth/session'));
        const { user } = await response.json();
        document.getElementById('current-user').textContent = `${user.full_name} (${user.role})`;
        await Promise.all([loadDashboard(), loadProducts()]);
    } catch (error) {
        console.error('Session error:', error.message);
    }
}

initializeDashboard();
