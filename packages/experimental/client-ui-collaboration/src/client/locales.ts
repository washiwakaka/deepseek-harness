/** Collaboration-room Web dictionaries. */

/** Locale namespace owned by the collaboration-room Web UI. */
export const NS = 'collaboration-room'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  badge: '协作房间',
  'roster.aria': '占用者 {names}',
  'message.aria': '{name} 的房间消息',
  send: '发到房间',
  'send.aria': '把草稿发到协作房间',
  'actor.aria': '选择发到房间的真人',
  'section.people': '用户',
  'section.models': '模型',
  'message.from': '以上回答来自 {name}',
  prompt: '带房间发送',
  'prompt.aria': '把草稿和房间记录发给当前模型',
  'send.failed': '发送失败',
  'send.noHuman': '房间没有真人占用者',
  thinking: '深度求索中',
  'thinking.aria': '{name} 正在思考',
  publish: '推到主会话',
  'publish.aria': '把当前分支的最新回答发到协作房间',
} satisfies Record<string, string>

/** Collaboration-room locale key union. */
export type CollaborationRoomKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  badge: 'Collaboration room',
  'roster.aria': 'Occupants {names}',
  'message.aria': 'Room message from {name}',
  send: 'Post to room',
  'send.aria': 'Post the draft to the collaboration room',
  'actor.aria': 'Choose which human posts to the room',
  'section.people': 'People',
  'section.models': 'Models',
  'message.from': 'This answer is from {name}',
  prompt: 'Send with room',
  'prompt.aria': "Send the draft and room transcript to this conversation's model",
  'send.failed': 'Could not post',
  'send.noHuman': 'No human occupant is configured',
  thinking: 'Deep diving',
  'thinking.aria': '{name} is thinking',
  publish: 'Push to room',
  'publish.aria': 'Post this branch\'s latest answer to the collaboration room',
} satisfies Record<CollaborationRoomKey, string>

/** Japanese copy, checked against the English keys. */
export const ja = {
  badge: 'コラボレーションルーム',
  'roster.aria': '参加者 {names}',
  'message.aria': '{name} のルームメッセージ',
  send: 'ルームに投稿',
  'send.aria': '下書きをコラボレーションルームに投稿',
  'actor.aria': 'ルームに投稿する人を選ぶ',
  'section.people': 'ユーザー',
  'section.models': 'モデル',
  'message.from': 'この回答は {name} によるものです',
  prompt: 'ルーム付きで送信',
  'prompt.aria': '下書きとルーム記録をこの会話のモデルに送る',
  'send.failed': '投稿できませんでした',
  'send.noHuman': '人間の参加者は設定されていません',
  thinking: '深く探索中',
  'thinking.aria': '{name} が考えています',
  publish: 'ルームに送る',
  'publish.aria': 'このブランチの最新の回答をコラボレーションルームに投稿',
} satisfies Record<keyof typeof en, string>

/** Spanish copy, checked against the English keys. */
export const es = {
  badge: 'Sala de colaboración',
  'roster.aria': 'Ocupantes {names}',
  'message.aria': 'Mensaje de sala de {name}',
  send: 'Publicar en la sala',
  'send.aria': 'Publicar el borrador en la sala de colaboración',
  'actor.aria': 'Elegir qué humano publica en la sala',
  'section.people': 'Personas',
  'section.models': 'Modelos',
  'message.from': 'Esta respuesta es de {name}',
  prompt: 'Enviar con la sala',
  'prompt.aria': 'Enviar el borrador y la transcripción de la sala a este modelo',
  'send.failed': 'No se pudo publicar',
  'send.noHuman': 'No hay un ocupante humano configurado',
  thinking: 'Exploración profunda',
  'thinking.aria': '{name} está pensando',
  publish: 'Enviar a la sala',
  'publish.aria': 'Publicar la última respuesta de esta rama en la sala de colaboración',
} satisfies Record<keyof typeof en, string>

/** French copy, checked against the English keys. */
export const fr = {
  badge: 'Salle de collaboration',
  'roster.aria': 'Occupants {names}',
  'message.aria': 'Message de salle de {name}',
  send: 'Publier dans la salle',
  'send.aria': 'Publier le brouillon dans la salle de collaboration',
  'actor.aria': 'Choisir quel humain publie dans la salle',
  'section.people': 'Personnes',
  'section.models': 'Modèles',
  'message.from': 'Cette réponse vient de {name}',
  prompt: 'Envoyer avec la salle',
  'prompt.aria': 'Envoyer le brouillon et la transcription de la salle à ce modèle',
  'send.failed': 'Impossible de publier',
  'send.noHuman': "Aucun occupant humain n'est configuré",
  thinking: 'Exploration en profondeur',
  'thinking.aria': '{name} réfléchit',
  publish: 'Envoyer dans la salle',
  'publish.aria': 'Publier la dernière réponse de cette branche dans la salle de collaboration',
} satisfies Record<keyof typeof en, string>

/** German copy, checked against the English keys. */
export const de = {
  badge: 'Kollaborationsraum',
  'roster.aria': 'Teilnehmer {names}',
  'message.aria': 'Raumnachricht von {name}',
  send: 'Im Raum posten',
  'send.aria': 'Entwurf im Kollaborationsraum posten',
  'actor.aria': 'Menschlichen Absender für den Raum wählen',
  'section.people': 'Personen',
  'section.models': 'Modelle',
  'message.from': 'Diese Antwort stammt von {name}',
  prompt: 'Mit Raum senden',
  'prompt.aria': 'Entwurf und Raumprotokoll an dieses Modell senden',
  'send.failed': 'Posten fehlgeschlagen',
  'send.noHuman': 'Kein menschlicher Teilnehmer konfiguriert',
  thinking: 'Tiefes Eintauchen',
  'thinking.aria': '{name} denkt nach',
  publish: 'In den Raum senden',
  'publish.aria': 'Die neueste Antwort dieses Zweigs im Kollaborationsraum posten',
} satisfies Record<keyof typeof en, string>

/** Russian copy, checked against the English keys. */
export const ru = {
  badge: 'Комната совместной работы',
  'roster.aria': 'Участники {names}',
  'message.aria': 'Сообщение комнаты от {name}',
  send: 'Отправить в комнату',
  'send.aria': 'Отправить черновик в комнату совместной работы',
  'actor.aria': 'Выбрать человека для публикации в комнате',
  'section.people': 'Люди',
  'section.models': 'Модели',
  'message.from': 'Этот ответ дал {name}',
  prompt: 'Отправить с комнатой',
  'prompt.aria': 'Отправить черновик и запись комнаты этой модели',
  'send.failed': 'Не удалось отправить',
  'send.noHuman': 'Человек-участник не настроен',
  thinking: 'Глубокий поиск',
  'thinking.aria': '{name} думает',
  publish: 'В комнату',
  'publish.aria': 'Отправить последний ответ этой ветки в комнату совместной работы',
} satisfies Record<keyof typeof en, string>

/** Portuguese copy, checked against the English keys. */
export const pt = {
  badge: 'Sala de colaboração',
  'roster.aria': 'Ocupantes {names}',
  'message.aria': 'Mensagem da sala de {name}',
  send: 'Publicar na sala',
  'send.aria': 'Publicar o rascunho na sala de colaboração',
  'actor.aria': 'Escolher qual humano publica na sala',
  'section.people': 'Pessoas',
  'section.models': 'Modelos',
  'message.from': 'Esta resposta é de {name}',
  prompt: 'Enviar com a sala',
  'prompt.aria': 'Enviar o rascunho e a transcrição da sala para este modelo',
  'send.failed': 'Não foi possível publicar',
  'send.noHuman': 'Nenhum ocupante humano está configurado',
  thinking: 'Mergulho profundo',
  'thinking.aria': '{name} está pensando',
  publish: 'Enviar para a sala',
  'publish.aria': 'Publicar a última resposta deste ramo na sala de colaboração',
} satisfies Record<keyof typeof en, string>
