#!/usr/bin/env node

import fs from 'fs';

interface TestResult {
    command: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    error?: string;
    details?: string;
    file?: string;
    timestamp?: string;
}

export function generateHTMLReport(results: TestResult[], outputPath: string = './test-report.html') {
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const skipped = results.filter(r => r.status === 'SKIP').length;
    const total = results.length;
    const successRate = ((passed / total) * 100).toFixed(2);
    const timestamp = new Date().toISOString();

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tyr Framework - Test Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .header p {
            opacity: 0.9;
            font-size: 1.1rem;
        }

        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }

        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
            transition: transform 0.2s;
        }

        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .stat-card .number {
            font-size: 2.5rem;
            font-weight: bold;
            margin: 10px 0;
        }

        .stat-card .label {
            color: #666;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .stat-card.total .number { color: #667eea; }
        .stat-card.passed .number { color: #10b981; }
        .stat-card.failed .number { color: #ef4444; }
        .stat-card.skipped .number { color: #f59e0b; }
        .stat-card.rate .number { color: #8b5cf6; }

        .results {
            padding: 30px;
        }

        .results h2 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.8rem;
        }

        .test-item {
            background: white;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            transition: all 0.2s;
        }

        .test-item:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            transform: translateX(5px);
        }

        .test-item.pass {
            border-left: 4px solid #10b981;
        }

        .test-item.fail {
            border-left: 4px solid #ef4444;
            background: #fef2f2;
        }

        .test-item.skip {
            border-left: 4px solid #f59e0b;
            background: #fffbeb;
        }

        .test-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }

        .test-name {
            font-size: 1.2rem;
            font-weight: 600;
            color: #1f2937;
        }

        .test-status {
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
        }

        .test-status.pass {
            background: #d1fae5;
            color: #065f46;
        }

        .test-status.fail {
            background: #fee2e2;
            color: #991b1b;
        }

        .test-status.skip {
            background: #fef3c7;
            color: #92400e;
        }

        .test-file {
            color: #6b7280;
            font-size: 0.9rem;
            margin-bottom: 10px;
            font-family: 'Courier New', monospace;
        }

        .test-details {
            color: #4b5563;
            font-size: 0.95rem;
            margin-top: 10px;
            padding: 10px;
            background: #f9fafb;
            border-radius: 4px;
        }

        .test-error {
            color: #dc2626;
            font-weight: 600;
            margin-top: 10px;
        }

        .test-stack {
            margin-top: 10px;
            padding: 15px;
            background: #1f2937;
            color: #f9fafb;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            overflow-x: auto;
            white-space: pre-wrap;
        }

        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6b7280;
            font-size: 0.9rem;
        }

        .progress-bar {
            width: 100%;
            height: 30px;
            background: #e5e7eb;
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981 0%, #059669 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            transition: width 0.3s ease;
        }

        .filters {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .filter-btn {
            padding: 10px 20px;
            border: 2px solid #e5e7eb;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            font-weight: 500;
        }

        .filter-btn:hover {
            background: #f3f4f6;
        }

        .filter-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        @media (max-width: 768px) {
            .summary {
                grid-template-columns: 1fr;
            }

            .header h1 {
                font-size: 1.8rem;
            }

            .test-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Tyr Framework Test Report</h1>
            <p>Generado el ${new Date(timestamp).toLocaleString('es-ES')}</p>
        </div>

        <div class="summary">
            <div class="stat-card total">
                <div class="label">Total Tests</div>
                <div class="number">${total}</div>
            </div>
            <div class="stat-card passed">
                <div class="label">✓ Passed</div>
                <div class="number">${passed}</div>
            </div>
            <div class="stat-card failed">
                <div class="label">✗ Failed</div>
                <div class="number">${failed}</div>
            </div>
            <div class="stat-card skipped">
                <div class="label">⊘ Skipped</div>
                <div class="number">${skipped}</div>
            </div>
            <div class="stat-card rate">
                <div class="label">Success Rate</div>
                <div class="number">${successRate}%</div>
            </div>
        </div>

        <div style="padding: 0 30px;">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${successRate}%">
                    ${successRate}%
                </div>
            </div>
        </div>

        <div class="results">
            <h2>Test Results</h2>
            
            <div class="filters">
                <button class="filter-btn active" onclick="filterResults('all')">All (${total})</button>
                <button class="filter-btn" onclick="filterResults('pass')">Passed (${passed})</button>
                <button class="filter-btn" onclick="filterResults('fail')">Failed (${failed})</button>
                <button class="filter-btn" onclick="filterResults('skip')">Skipped (${skipped})</button>
            </div>

            <div id="test-results">
                ${results.map(result => `
                    <div class="test-item ${result.status.toLowerCase()}" data-status="${result.status.toLowerCase()}">
                        <div class="test-header">
                            <div class="test-name">${result.command}</div>
                            <div class="test-status ${result.status.toLowerCase()}">${result.status}</div>
                        </div>
                        ${result.file ? `<div class="test-file">📄 ${result.file}</div>` : ''}
                        ${result.details ? `<div class="test-details">ℹ️ ${result.details}</div>` : ''}
                        ${result.error ? `<div class="test-error">❌ ${result.error}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="footer">
            <p>Tyr Framework Testing System v1.0</p>
            <p>Este reporte fue generado automáticamente</p>
        </div>
    </div>

    <script>
        function filterResults(filter) {
            const items = document.querySelectorAll('.test-item');
            const buttons = document.querySelectorAll('.filter-btn');
            
            buttons.forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            items.forEach(item => {
                if (filter === 'all' || item.dataset.status === filter) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        }
    </script>
</body>
</html>
    `.trim();

    fs.writeFileSync(outputPath, html);
    console.log(`\n✅ Reporte HTML generado: ${outputPath}`);
}

// Ejemplo de uso si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    // Datos de ejemplo para prueba
    const sampleResults: TestResult[] = [
        {
            command: 'gen',
            status: 'PASS',
            file: 'src/core/sys/gen.ts',
            details: 'Comando ejecutado correctamente'
        },
        {
            command: 'dw',
            status: 'PASS',
            file: 'src/commands/dw.tyr.ts',
            details: 'Comando requiere argumentos (esperado)'
        },
        {
            command: 'install',
            status: 'FAIL',
            file: 'src/commands/install.tyr.ts',
            error: 'Error al cargar módulo: Cannot find module',
            details: 'Stack trace: Error: Cannot find module...'
        }
    ];

    generateHTMLReport(sampleResults);
}
