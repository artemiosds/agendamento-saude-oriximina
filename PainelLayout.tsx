// ... previous lines
// Assuming the lines we want to replace are around 130-132:
const setor = typeof user.setor === 'string' ? user.setor : String(user.setor || '');
const cargo = typeof user.cargo === 'string' ? user.cargo : String(user.cargo || '');
// ... following lines