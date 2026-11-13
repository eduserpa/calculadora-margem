// Projeto Supabase do Calculéo. A chave "publishable" é pública (feita para ir no site); quem protege os dados é a RLS.
// A chave secreta nunca entra aqui nem no repositório.
// Versão que aparece na plaquinha do leão (canto do app).
export const VERSAO = 'Alpha 1.1.1';

// Liga o botão "Esqueci a senha" do login. Só depois de configurar o SMTP no Supabase
// (backups/relatorios/modu/SMTP-ESQUECI-SENHA.md); sem ele, o e-mail só chega para quem é membro do projeto.
export const ESQUECI_SENHA = false;

export const SUPABASE = {
  url: 'https://umaaczpmgqqpjucvlcmz.supabase.co',
  chave: 'sb_publishable_P_FidpTpGlqiUVaa9pwDqQ_fvAu9S3D',
};
