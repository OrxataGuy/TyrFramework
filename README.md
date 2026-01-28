# Tyr Framework - Guía Completa del Proyecto

**Autor:** Manel Andreu Pérez  
**Versión:** 1.0.0  
**Licencia:** MIT

---

## 📋 Descripción del Proyecto

Tyr Framework es un entorno de ejecución basado en TypeScript que permite crear, ejecutar y automatizar herramientas CLI de manera declarativa.

La arquitectura se construye sobre **inyección de dependencias**: el "Kernel" proporciona un contexto de ejecución donde los "Managers" exponen su funcionalidad a través de una API auto-generada. Gracias a un sistema de introspección de código, el entorno analiza tipos y documentación en tiempo real.

---

## 📁 Estructura del Proyecto

```
/
├── bin/
│   └── tyr.ts                    // Punto de entrada del CLI
│
├── src/
│   ├── core/
│   │   ├── Kernel.ts             // Motor principal de ejecución
│   │   ├── Container.ts          // Contenedor de servicios (inyección de dependencias)
│   │   ├── TyrError.ts           // Manejo de errores personalizado
│   │   └── sys/
│   │       ├── gen.ts            // Comando: generar nuevos comandos
│   │       ├── rem.ts            // Comando: remover comandos
│   │       └── doc.ts            // Comando: generar documentación
│   │
│   ├── commands/
│   │   ├── install.tyr.ts        // Comando: instalar el framework
│   │   └── dw.tyr.ts             // Comando: descargar dependencias
│   │
│   └── lib/
│       ├── ShellManager.ts       // Ejecución de comandos shell
│       ├── FileSystemManager.ts  // Operaciones del sistema de archivos
│       ├── PackageManager.ts     // Gestión de paquetes (npm)
│       ├── DockerManager.ts      // Integración con Docker
│       ├── GitManager.ts         // Operaciones de Git
│       ├── SystemManager.ts      // Gestión del sistema
│       ├── SQLManager.ts         // Consultas a bases de datos MSSQL
│       └── WebManager.ts         // Requests HTTP
│
├── tests/
│   ├── commands.test.ts          // Tests de comandos (Vitest)
│   ├── test-runner.ts            // Runner de smoke tests
│   └── setup.ts                  // Configuración de mocks
│
├── config/
│   └── map.yml                   // Configuración de comandos del framework
│
├── local/
│   ├── aliases.sh                // Alias de shell personalizados
│   └── plugins.sh                // Plugins para shell
│
├── package.json                  // Dependencias y scripts
├── tsconfig.json                 // Configuración de TypeScript
├── vitest.config.ts              // Configuración de tests
└── html-reporter.ts              // Generador de reportes HTML
```

---

## 🎯 Conceptos Clave

### 1. KERNEL (`src/core/Kernel.ts`)

- **Orquestador principal** del framework
- Carga configuración desde `config/map.yml`
- Enruta comandos hacia sus manejadores
- Proporciona el contexto de ejecución (`TyrContext`)
- **Métodos principales:**
  - `boot(args)`: Inicializa el framework
  - `handle(args)`: Ejecuta comandos

### 2. CONTAINER (`src/core/Container.ts`)

- Contenedor de **inyección de dependencias**
- Instancia todos los servicios (Managers)
- Expone interfaz `ServiceContainer` con todos los servicios
- Implementa patrón Singleton para servicios

### 3. MANAGERS (`src/lib/*.ts`)

Conjunto de abstracciones sobre librerías externas. Ejecutar comando de documentación para saber más.

```bash
tyr doc
```

### 4. COMANDOS

Son funciones que siguen el patrón:

```typescript
export default ({ task, fail, logger, fs, shell }: TyrContext) => {
    return async (args: string[]) => {
        // Lógica del comando
    };
};
```

Los comandos personalizados se registran en `config/map.yml`

### 5. CONFIGURACIÓN (`config/map.yml`)

Define los comandos disponibles:

```yaml
commands:
  install: ./src/commands/install.tyr.ts
  dw: ./src/commands/dw.tyr.ts
```

---

## 🚀 Cómo Usar el Framework

### Instalación

```bash
npm install
npm run install        # Ejecuta el comando install
```

### Ejecutar Comandos

```bash
tyr <nombre-comando> [argumentos]
```

**Ejemplos:**
- `tyr install` - Instala y configura el framework
- `tyr gen micomando` - Genera un nuevo comando
- `tyr rem micomando` - Elimina un comando
- `tyr doc` - Genera documentación
- `tyr dw` - Descarga dependencias

### Crear un Nuevo Comando

```bash
tyr gen <nombre-comando> <nombre-archivo>
```

Se creará el archivo en `src/commands/<nombre-archivo>.tyr.ts`:

```typescript
import { TyrContext } from '../core/Kernel';

export default ({ task, fail, logger, fs, shell }: TyrContext) => {
    return async (args: string[]) => {
        // Validar argumentos
        if (args.length === 0) {
            fail('Se requiere al menos un argumento');
        }
        
        // Usar tareas con descripción
        await task('Realizando acción', async () => {
            logger.info('Procesando...');
            // Tu lógica aquí
        });
        
        logger.success('¡Listo!');
    };
};
```

### Eliminarc un Comando Existente
```bash
tyr rem <nombre-comando>
```


---

## 🧪 Testing

El framework incluye un sistema de testing completo:

### Tests Unitarios (Vitest)

```bash
npm run test              # Ejecutar tests
npm run test:watch        # Modo watch
npm run test:ui           # UI interactivo
npm run test:coverage     # Cobertura
```

### Smoke Tests

```bash
npm run test:smoke        # Valida que todos los comandos cargan correctamente
```

**Verifica:**
- Comandos cargan como módulos
- Exportan función por defecto
- Se instancian con contexto
- Se ejecutan sin excepciones no controladas

### Mocks

El archivo `tests/setup.ts` proporciona `createMockContext()` que mocka:
- Logger
- ShellManager
- FileSystemManager
- Todos los managers

---

## 📊 Flujo de Ejecución

```
1. Usuario ejecuta: tyr micomando arg1 arg2
   ↓
2. bin/tyr.ts captura el comando
   ↓
3. Kernel.boot() inicializa el framework
   ↓
4. Container.init() crea todos los Managers
   ↓
5. Carga config/map.yml
   ↓
6. Kernel.handle() recibe [micomando, arg1, arg2]
   ↓
7. Busca el comando en la configuración
   ↓
8. Importa el módulo dinámicamente
   ↓
9. Instancia el comando pasando TyrContext
   ↓
10. Ejecuta comando(args)
    ↓
11. Retorna resultado o error
```

---

## 📦 Dependencias Principales

### Runtime

- **chalk** - Colores en terminal
- **execa** - Ejecución de shell mejorada
- **axios** - HTTP client
- **mssql** - Driver MSSQL
- **js-yaml** - Parser YAML
- **inquirer** - Prompts interactivos
- **dotenv** - Variables de entorno
- **cheerio** - Web scraping
- **find-config** - Búsqueda de archivos de config

### Dev

- **TypeScript** - Lenguaje
- **Vitest** - Testing framework
- **tsx** - Ejecutor TypeScript
- **Vite** - Build tool
- **Husky** - Git hooks

---

## 🔧 Configuración Importante

### tsconfig.json
- `target`: ES2020
- `module`: ES2020
- `moduleResolution`: node

### package.json
- `type`: module (módulos ES)
- `bin`: { tyr: ./bin/tyr.ts }

### vitest.config.ts
- Test runner del proyecto
- Configuración de mocks y setup

---

## 🎨 Patrones y Best Practices

### Inyección de Dependencias

```typescript
const command = ({ logger, fs, shell }: TyrContext) => {
    // Los managers se inyectan automáticamente
    return async (args) => { ... };
};
```

### Manejo de Errores

- Usa `fail(message, suggestion?)` para errores controlados
- `fail()` lanza `TyrError`
- Los comandos pueden capturar y manejar excepciones

### Tareas con Descripción

```typescript
await task('Descripción', async () => {
    // Operación
});
// Muestra progreso en terminal
```

### Logging

```typescript
logger.info()     // Información general
logger.success()  // Operación exitosa
logger.error()    // Error (solo en debug)
logger.warn()     // Advertencia (solo en debug)
```

### Argumentos de Comando

Siempre valida los argumentos al inicio:

```typescript
if (args.length < 2) {
    fail('Se requieren 2 argumentos', 'Sintaxis: tyr cmd arg1 arg2');
}
```

---

## 📚 Comandos Disponibles

### Comandos del Sistema

#### `tyr gen <nombre-comando> [archivo-salida]`
Genera un nuevo comando con template
- Crea archivo en `src/commands/`
- Registra en `config/map.yml`

#### `tyr rem <nombre-comando>`
Elimina un comando
- Borra archivo del comando
- Elimina entrada en `config/map.yml`

#### `tyr doc`
Genera documentación completa del sistema
- Analiza todos los comandos
- Extrae tipos y comentarios JSDoc
- Genera HTML interactivo

### Comandos Personalizados

#### `tyr install`
Instala y configura el framework
- Crea estructura de carpetas
- Copia templates
- Configura alias 'tyre' en .zshrc

#### `tyr dw`
Descarga y configura dependencias
- Instala paquetes npm
- Configura variables de entorno
- Verifica instalaciones externas

---

## 🐛 Debugging

Ejecuta con flag `--debug` para ver más información:

```bash
tyr micomando --debug
```

- Activa logging de errores y warnings
- Muestra detalles de operaciones

---

## 📝 Notas de Desarrollo

- El framework usa módulos ES6, asegúrate de `"type": "module"` en `package.json`
- Los comandos deben ser `async`
- Siempre retorna del handler o lanza error
- Usa la inyección de dependencias, no importes managers directamente
- Los tests usan mocks automáticos del `setup.ts`
- El smoke test valida que todos los comandos cargan correctamente

---

## 🔗 Referencias Útiles

Archivos principales para empezar:

- [src/core/Kernel.ts](src/core/Kernel.ts) - Entender cómo funciona el motor
- [src/core/Container.ts](src/core/Container.ts) - Ver cómo se inyectan dependencias
- [src/commands/install.tyr.ts](src/commands/install.tyr.ts) - Ejemplo de comando completo
- [src/core/sys/gen.ts](src/core/sys/gen.ts) - Cómo generar nuevos comandos
- [tests/test-runner.ts](tests/test-runner.ts) - Sistema de testing

---

## Licencia

**Autor:** Manel Andreu Pérez  
**Versión:** 1.0.0  
**Licencia:** MIT  
**Tipo de proyecto:** CLI Framework para Automatización DevOps
