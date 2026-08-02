# Zagarollo Embalagens — site

Site institucional de duas páginas da Zagarollo Embalagens (Descalvado-SP), fabricante
de caixas flexíveis e sacolas de papel desde 2002.

## Conceito

O eixo da comunicação é o que uma embalagem realmente faz: **presentear, levar e guardar**.
Daí a frase da capa — *"O que importa vai dentro."* A embalagem é sempre a primeira coisa
que a pessoa toca antes de chegar no que está dentro dela.

## Páginas

| Arquivo | Conteúdo |
| --- | --- |
| `index.html` | Capa, os três usos da embalagem, as duas famílias de produto, a empresa, orçamento e contato |
| `produtos.html` | Catálogo dos 29 modelos com filtro por categoria, e as opções de acabamento |

## Stack

HTML, CSS e JavaScript puros — sem build, sem dependências, sem framework. O site é
estático de ponta a ponta, o que o torna rápido, barato de hospedar e simples de editar.

- `estilo.css` — folha única. Paleta em variáveis CSS no topo do arquivo (`--azul`, `--verde`).
- `script.js` — menu no celular, formulário de orçamento e catálogo filtrável.
- `staticwebapp.config.json` — rotas, cabeçalhos de segurança e cache do Azure Static Web Apps.

## Paleta

Extraída do próprio logo da empresa:

| Cor | Hex |
| --- | --- |
| Azul royal | `#2f4b8f` |
| Azul escuro | `#23386b` |
| Verde | `#00874a` |
| Verde claro | `#8fd0ae` |

## Formulário de orçamento

Não há backend. O envio monta um `mailto:` já preenchido para
`telemarketing@zagarollo.com.br`, e cada modelo do catálogo tem um link direto de
WhatsApp com o nome do kit na mensagem.

Para trocar o destino, edite `EMAIL_COMERCIAL` no topo de `script.js`.

> ⚠️ O número de WhatsApp usado nos links (`551935831743`) é o telefone comercial da
> empresa e precisa ser confirmado antes de ir para o ar em domínio próprio.

## Rodar localmente

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

## Deploy

Hospedado no Azure Static Web Apps. Todo push na branch `main` publica automaticamente
via GitHub Actions.
