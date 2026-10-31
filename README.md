# 📚 HiBook

> Uma aplicação web moderna e minimalista para a gestão de bibliotecas pessoais, inspirada no design fluido e visual do Pinterest.

🔗 **Acesse a aplicação online:** [hibook.vercel.app](https://hibook.vercel.app)

> ⚠️ **Aviso Importante / Project Status:**
> O **HiBook** encontra-se atualmente em **fase de testes e desenvolvimento ativo**. Por se tratar de um projeto em constante evolução, o repositório passará por frequentes refatorações e ajustes, incluindo a **reorganização da arquitetura de pastas, padronização e otimização da estrutura de código, além do aprimoramento no gerenciamento de chaves sigilosas e variáveis de ambiente (env)**.

---

## 🚀 Sobre o Projeto

O **HiBook** foi desenvolvido para proporcionar uma experiência imersiva e organizada na catalogação de leituras. Com uma interface inspirada no feed do Pinterest, o sistema permite que o usuário gerencie sua estante pessoal de forma prática, acompanhando títulos, autores, capas e status de leitura. 

O projeto foca em alta performance e leveza, construído totalmente sem frameworks pesados de frontend, priorizando a modularidade e o domínio de tecnologias nativas.

---

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído utilizando as seguintes tecnologias e ferramentas:

* **Frontend:** 
  * `HTML5` & `CSS3` (Estilização customizada e responsiva)
  * `Vanilla JavaScript` (ES6+ modular)
  * `Lucide Icons` (Ícones minimalistas)
* **Backend & Banco de Dados:** 
  * `Supabase` (Backend-as-a-Service)
  * `PostgreSQL` (Modelagem relacional e persistência de dados)
* **Hospedagem & Deploy:**
  * `Vercel` (Deploy contínuo e alta disponibilidade)


---

## ✨ Funcionalidades

* **Autenticação de Usuários:** Sistema seguro de cadastro e login integrado ao Supabase Auth.
* **CRUD Completo de Livros:** Adicione novos livros, edite informações, altere o status de leitura e remova itens da sua estante.
* **Interface Estilo Pinterest:** Visualização em cartões (cards) fluídos e responsivos para melhor apreciação das capas e detalhes das obras.
* **Filtros e Organização:** Ferramentas para navegar facilmente pela sua biblioteca pessoal.

---

## 📁 Estrutura de Diretórios (Em Refatoração)

```text
hibook/
├── src/
│   ├── assets/       # Imagens e recursos visuais
│   ├── css/          # Folhas de estilo modulares
│   ├── js/           # Scripts divididos por responsabilidade (API, UI, Auth)
│   └── views/        # Componentes e páginas da aplicação
├── index.html        # Ponto de entrada principal
└── README.md         # Documentação do projeto