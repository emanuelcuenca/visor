# AgroVisor — frontend

Frontend basado en React 19, Vite y React-Leaflet.

## Desarrollo

```bash
npm install
npm run dev
```

## Configuración de API

Copiar `.env.example` a `.env` y configurar `VITE_API_URL` para apuntar al backend.

El selector de organización → establecimiento → lote → campaña está preparado para integrarse mediante endpoints configurables:

- `VITE_API_ORGANIZATIONS`
- `VITE_API_ESTABLISHMENTS` (puede incluir `:parentId`)
- `VITE_API_LOTS` (puede incluir `:parentId`)
- `VITE_API_CAMPAIGNS` (puede incluir `:parentId`)

Las rutas de la jerarquía son opcionales. No se crean organizaciones, lotes ni campañas ficticios cuando el backend todavía no provee esos datos.

## Estructura

- `src/App.jsx`: entrada y proveedor de selección global.
- `src/app/context/SelectionContext.jsx`: selección jerárquica global.
- `src/features/workspace/WorkspaceCore.jsx`: interfaz actual del espacio de trabajo y lógica existente del mapa.
- `src/features/organizations/components/AgroSelectorTopbar.jsx`: selectores jerárquicos.
- `src/features/lots/components/LotUploader.jsx`: entrada de importación de áreas vectoriales.
- `src/features/satellite/components/SatelliteControl.jsx`: control reutilizable de índice y fechas.
- `src/features/classification/components/ClassificationPanel.jsx`: selector de los cinco métodos de clasificación.
- `src/features/dem/components/DemPanel.jsx`: selector de productos DEM.
- `src/services/api.js` y `src/services/endpoints/`: configuración de acceso al backend.
- `src/utils/geometry.js`: utilidades GeoJSON/BBOX para ajustar la vista del mapa.

Los módulos de satélite, clasificación y DEM son componentes reutilizables preparados para la extracción progresiva de los paneles actuales; la lógica operativa existente se conserva en `WorkspaceCore.jsx` para evitar una reescritura que altere el comportamiento cartográfico.
