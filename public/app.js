
// Get dashboard statistics from the backend
async function loadDashboard() {
    try {
        const response = await fetch('/api/dashboard');

        if (!response.ok) {
            throw new Error('Could not load dashboard');
        }

        const data = await response.json();

        document.getElementById('total-products').textContent =
            data.total_products;

        document.getElementById('total-stock').textContent =
            data.total_stock;

        document.getElementById('stock-value').textContent =
            `GH₵ ${Number(data.stock_value).toFixed(2)}`;

        document.getElementById('total-sales').textContent =
            `GH₵ ${Number(data.total_sales).toFixed(2)}`;

    } catch (error) {
        console.error('Dashboard error:', error.message);
    }
}


// Get products from the backend
async function loadProducts() {
    try {
        const response = await fetch('/api/products');

        if (!response.ok) {
            throw new Error('Could not load products');
        }

        const products = await response.json();

        const table = document.getElementById('products-table');

        table.innerHTML = '';

        if (products.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="5">No products found</td>
                </tr>
            `;
            return;
        }

        products.forEach(product => {
            const row = document.createElement('tr');

            const values = [
                product.name,
                product.sku,
                product.category || '-',
                `GH₵ ${Number(product.price).toFixed(2)}`,
                product.quantity
            ];

            values.forEach(value => {
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


// Add a new product
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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(product)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Could not add product');
        }

        alert('Product added successfully!');

        document.getElementById('product-form').reset();

        await loadProducts();
        await loadDashboard();

    } catch (error) {
        alert(error.message);
    }
});


// Load dashboard and products when the website opens
loadDashboard();
loadProducts();
