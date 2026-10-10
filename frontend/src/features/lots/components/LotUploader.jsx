import { forwardRef } from 'react';

const LotUploader = forwardRef(function LotUploader({ onChange }, ref) {
  return <input ref={ref} type="file" accept=".zip,.geojson,.json,.kml,.kmz" onChange={onChange} style={{ display: 'none' }} aria-label="Importar lote o área" />;
});
export default LotUploader;
