# TunariGuard

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

La configuración compartida del frontend está en `src/environments/`. Para desarrollo,
`ng serve` usa `environment.development.ts`; allí se configura `apiBaseUrl` para todo el
backend (por defecto `http://localhost:3000/api/v1`). Si el backend corre en otra máquina,
cambien ese valor por la URL accesible desde los navegadores del equipo. No agreguen `/`
al final. La configuración se versiona para que el equipo use el mismo valor.

El mapa usa `mapDataOrigin: 'BACKEND'` para consultar la API; se puede cambiar a `'DEMO'`
en el mismo archivo mientras el backend no esté disponible. En producción, `environment.ts`
usa `/api/v1`, por lo que el servidor de despliegue debe servir esa ruta o configurarla como
proxy al backend.

La actualización en vivo usa Socket.IO en el namespace `/realtime` del mismo origen que
`apiBaseUrl`. Si se usa un proxy, debe reenviar también `/socket.io/`, tanto HTTP como
la actualización a WebSocket. Si frontend y backend tienen orígenes distintos, incluye
el origen del frontend en `CORS_ORIGINS` del backend.

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
