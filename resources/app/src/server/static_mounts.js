import express from 'express';

export function mountStatic(app){
  // Expose covers and library directories under /data
  app.use('/data/covers', express.static(app.get('COVER_DIR')));
  app.use('/data/library', express.static(app.get('LIB_DIR')));
}
