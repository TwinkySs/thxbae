# Выкладка Checkys в интернет (Render, бесплатно)

1. Создайте репозиторий на github.com и загрузите в его КОРЕНЬ всё содержимое этой папки
   (server.js, package.json, render.yaml, папка public/ и остальное).
2. render.com -> войти через GitHub -> New -> Blueprint -> выбрать репозиторий -> Apply.
   (Либо New -> Web Service: Start Command `node server.js`, Plan Free, Env `DEMO=1`.)
3. Через 2-3 минуты откроется адрес вида https://checkys.onrender.com
4. Свой домен: Render -> сервис -> Settings -> Custom Domains.

Важно:
- Free-тариф засыпает после ~15 минут без запросов (первое открытие ~1 минута).
- Диск временный: при перезапуске/деплое данные сбрасываются к демо-данным.
  Для постоянного хранения: платный Render Disk (mount path = /opt/render/project/src/data) или VPS.
- DEMO=1 открывает быстрый вход и сброс данных любому, у кого есть ссылка.
  Для реальных пользователей уберите DEMO и смените пароли.
