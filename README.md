# 📚 HiBook

<div align="center">

[![Status do Projeto](https://img.shields.io/badge/Status-Em_Desenvolvimento-orange?style=for-the-badge&logo=codeforces)](https://github.com/)
[![Tecnologia](https://img.shields.io/badge/Stack-Pure_Code_%2F_Vanilla-blue?style=for-the-badge&logo=javascript)](https://github.com/)
[![Hospedagem](https://img.shields.io/badge/Hospedagem-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/)
[![Banco de Dados](https://img.shields.io/badge/Database-Supabase_%28PostgreSQL%29-green?style=for-the-badge&logo=supabase)](https://supabase.com/)

</div>

---

## 🚀 Sobre o Projeto

O **HiBook** é uma aplicação web moderna voltada para a gestão de bibliotecas pessoais. O projeto foi desenvolvido inteiramente com **código puro (Pure Code / Vanilla JavaScript, HTML e CSS)**, sem o uso de frameworks pesados de interface, focando em uma arquitetura limpa, modular e altamente performática. 

Atualmente, o projeto encontra-se **em desenvolvimento ativo**, com foco na experiência do usuário e na integração robusta com serviços em nuvem.

---

## ⚙️ Funcionalidades

* **Autenticação de Usuários:** Sistema de cadastro e login seguro para gerenciar sessões individuais.
* **Gerenciamento de Livros (CRUD completo):**
  * **Inserir:** Adicione novos livros à sua biblioteca digital informando detalhes relevantes.
  * **Visualizar:** Navegue pela galeria ou lista de livros cadastrados com uma interface intuitiva.
  * **Editar:** Atualize informações e dados dos livros conforme necessário.
* **Organização por Listas:** Organize suas leituras de forma personalizada.

---

## 🛠️ Tecnologias e Arquitetura

O projeto foi construído utilizando as seguintes tecnologias:

* **Front-end:** 
  * HTML5 / CSS3 (com arquivos modulares de estilos: `variables`, `layout`, `components`, `global`)
  * JavaScript Moderno (Modularizado em *Services*, *Views* e *Config*)
* **Back-end & Banco de Dados:** 
  * **Supabase** (utilizando **PostgreSQL** para persistência de dados e segurança com políticas de acesso)
* **Hospedagem e Deploy:** 
  * **Vercel** (preparado para implantação contínua e rápida)

---

## 📁 Estrutura de Diretórios

A estrutura do projeto foi organizada de forma modular para facilitar a manutenção e escalabilidade:

```text
hibook/
├── public/
│   ├── css/
│   │   ├── components.css
│   │   ├── global.css
│   │   ├── layout.css
│   │   └── variables.css
│   ├── js/
│   │   ├── config/
│   │   │   └── supabase.js
│   │   ├── services/
│   │   │   (auth_service.js, book_service.js, list_service.js)
│   │   └── views/
│   │       (auth_view.js, form_view.js, gallery_view.js, modal_view.js)
│   ├── app.js
│   └── index.html
├── .gitignore
├── package.json
└── README.md