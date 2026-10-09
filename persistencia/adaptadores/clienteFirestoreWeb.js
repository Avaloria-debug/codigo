/**
 * Fase 7 — Cliente real de Firestore para el navegador. Importa el SDK
 * modular por CDN (ESM nativo, sin paso de build) recién cuando se lo usa por
 * primera vez, y usa Auth ANÓNIMA sólo para satisfacer el requisito de sesión
 * de las reglas (no identifica al jugador entre dispositivos: eso lo hace el
 * código de partida).
 *
 * NO verificado contra Firebase real en esta fase: en el entorno de
 * construcción no hay acceso a la red de Firebase. Lo cubre un test con
 * módulos falsos inyectados vía `importar`; la prueba con tu proyecto real
 * (activar Auth anónima, publicar reglas, correr con tu `firebaseConfig`) es
 * el paso manual documentado en fase_7_ADENDUM.md, sección 8.
 */

import { VERSION_SDK_FIREBASE } from '../constantes.js';

/**
 * @param {object} config
 * @param {object} config.firebaseConfig - El objeto de configuración web de tu proyecto.
 * @param {string} [config.versionSdk]
 * @param {(url: string) => Promise<any>} [config.importar] - Inyectable; default `import()` dinámico.
 */
export function crearClienteFirestoreWeb({ firebaseConfig, versionSdk = VERSION_SDK_FIREBASE, importar = (url) => import(url) }) {
  if (!firebaseConfig) throw new Error('crearClienteFirestoreWeb: `firebaseConfig` es obligatorio.');

  const base = `https://www.gstatic.com/firebasejs/${versionSdk}`;
  let _promesaInicio = null;

  function iniciar() {
    if (!_promesaInicio) {
      _promesaInicio = (async () => {
        const [app, auth, firestore] = await Promise.all([
          importar(`${base}/firebase-app.js`),
          importar(`${base}/firebase-auth.js`),
          importar(`${base}/firebase-firestore.js`),
        ]);
        const aplicacion = app.initializeApp(firebaseConfig);
        return { auth, firestore, authInstancia: auth.getAuth(aplicacion), bd: firestore.getFirestore(aplicacion) };
      })().catch((error) => {
        _promesaInicio = null; // permite reintentar si falló la descarga del SDK
        throw error;
      });
    }
    return _promesaInicio;
  }

  return {
    async asegurarSesion() {
      const { auth, authInstancia } = await iniciar();
      if (!authInstancia.currentUser) await auth.signInAnonymously(authInstancia);
    },
    async leerDocumento(coleccion, id) {
      const { firestore, bd } = await iniciar();
      const snap = await firestore.getDoc(firestore.doc(bd, coleccion, id));
      return snap.exists() ? snap.data() : null;
    },
    async escribirDocumento(coleccion, id, datos) {
      const { firestore, bd } = await iniciar();
      await firestore.setDoc(firestore.doc(bd, coleccion, id), datos);
    },
  };
}
