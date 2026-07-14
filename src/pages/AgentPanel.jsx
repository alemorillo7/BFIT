import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgePlus, Bot, ContactRound, ImageUp, MessageSquareText, Paperclip, Search, SendHorizontal, Tag, Trash2, UserRound, Volume2, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { formatPhoneForDisplay, formatRelativeTime, formatTimestamp, getInitials, splitTextWithLinks } from '../lib/formatters';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import {
  assignConversationTags,
  deleteContact,
  deleteConversation,
  removeConversationTags,
  saveContact,
  sendAgentMessage,
  toggleConversationBot,
  uploadConversationFile,
} from '../services/chatApi';
import './AgentPanel.css';

const fetchConversations = async () => {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      phone_number,
      user_name,
      agent_active,
      last_message_preview,
      last_message_at,
      updated_at,
      contact:contacts (
        id,
        name,
        phone_number,
        email,
        notes,
        bot_active
      ),
      conversation_tags (
        tag:tags (
          id,
          name,
          color
        )
      )
    `)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data || []).map((item) => ({
    ...item,
    tags: (item.conversation_tags || []).map((relation) => relation.tag).filter(Boolean),
  }));
};

const fetchMessages = async (conversationId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender, content, message_type, media_url, mime_type, metadata, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
};

const fetchTags = async () => {
  const { data, error } = await supabase.from('tags').select('id, name, color').order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
};

const fetchContacts = async () => {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone_number, email, notes, bot_active, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

const emptyContactDraft = {
  name: '',
  phone_number: '',
  email: '',
  notes: '',
  bot_active: true,
};

const renderMessageBody = (message) => {
  if (message.message_type === 'image' && message.media_url) {
    return (
      <div className="message-media-stack">
        <img className="message-image" src={message.media_url} alt={message.content || 'Imagen adjunta'} />
        {message.content ? <p>{message.content}</p> : null}
      </div>
    );
  }

  if (message.message_type === 'audio' && message.media_url) {
    return (
      <div className="message-media-stack">
        <audio controls src={message.media_url} className="message-audio">
          Tu navegador no soporta audio embebido.
        </audio>
        {message.content ? <p>{message.content}</p> : null}
      </div>
    );
  }

  if (message.message_type === 'file' && message.media_url) {
    return (
      <a className="file-link" href={message.media_url} target="_blank" rel="noreferrer">
        Abrir archivo
      </a>
    );
  }

  return (
    <p>
      {splitTextWithLinks(message.content).map((part) =>
        part.isLink ? (
          <a key={`${message.id}-${part.content}`} href={part.content} target="_blank" rel="noreferrer">
            {part.content}
          </a>
        ) : (
          <span key={`${message.id}-${part.content}`}>{part.content}</span>
        ),
      )}
    </p>
  );
};

const AgentPanel = ({ section = 'conversations' }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tags, setTags] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [loadingDashboard, setLoadingDashboard] = useState(isSupabaseConfigured);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [workingAction, setWorkingAction] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState(emptyContactDraft);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectedConversationIdRef = useRef(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId || !supabase) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    try {
      setMessages(await fetchMessages(conversationId));
    } catch (error) {
      setErrorMessage(error.message || 'No se pudieron cargar los mensajes.');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const loadDashboardData = useCallback(
    async (preferredConversationId, includeMessages = true) => {
      if (!supabase) {
        setLoadingDashboard(false);
        return;
      }

      setLoadingDashboard(true);
      setErrorMessage('');

      try {
        const [conversationData, tagData, contactData] = await Promise.all([fetchConversations(), fetchTags(), fetchContacts()]);
        setConversations(conversationData);
        setTags(tagData);
        setContacts(contactData);

        const currentId = preferredConversationId ?? selectedConversationIdRef.current;
        const nextConversation = conversationData.find((conversation) => conversation.id === currentId) || conversationData[0] || null;
        setSelectedConversationId(nextConversation?.id ?? null);

        if (includeMessages && nextConversation?.id) {
          await loadMessages(nextConversation.id);
        } else if (!nextConversation?.id) {
          setMessages([]);
        }
      } catch (error) {
        setErrorMessage(error.message || 'No se pudo sincronizar el panel.');
      } finally {
        setLoadingDashboard(false);
      }
    },
    [loadMessages],
  );

  useEffect(() => {
    if (isSupabaseConfigured) {
      const timer = window.setTimeout(() => {
        loadDashboardData();
      }, 0);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [loadDashboardData]);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let refreshTimer;
    const scheduleRefresh = (includeMessages = false, conversationId) => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        loadDashboardData(conversationId ?? selectedConversationIdRef.current, includeMessages);
      }, 180);
    };

    const channel = supabase
      .channel(`agent-panel-realtime-${section}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => scheduleRefresh(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => scheduleRefresh(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, () => scheduleRefresh(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_tags' }, () => scheduleRefresh(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        scheduleRefresh(true, payload.new?.conversation_id ?? payload.old?.conversation_id ?? selectedConversationIdRef.current);
      })
      .subscribe();

    return () => {
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [loadDashboardData, section]);

  const filteredConversations = useMemo(() => {
    const term = conversationSearch.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const haystack = [conversation.user_name, conversation.contact?.name, conversation.phone_number, conversation.last_message_preview]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !term || haystack.includes(term);
      const matchesTag = !selectedTagFilter || conversation.tags.some((tagItem) => tagItem.name.toLowerCase() === selectedTagFilter.toLowerCase());

      return matchesSearch && matchesTag;
    });
  }, [conversations, conversationSearch, selectedTagFilter]);

  const filteredContacts = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    if (!term) {
      return contacts;
    }

    return contacts.filter((contact) => [contact.name, contact.phone_number, contact.email, contact.notes].join(' ').toLowerCase().includes(term));
  }, [contactSearch, contacts]);

  const handleSelectConversation = async (conversationId) => {
    setSelectedConversationId(conversationId);
    setIsTagPopoverOpen(false);
    await loadMessages(conversationId);
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !messageDraft.trim()) {
      return;
    }

    setSavingMessage(true);
    setErrorMessage('');

    try {
      await sendAgentMessage({
        phone_number: selectedConversation.phone_number,
        message: messageDraft.trim(),
      });
      setMessageDraft('');
      await loadDashboardData(selectedConversation.id, true);
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo enviar el mensaje.');
    } finally {
      setSavingMessage(false);
    }
  };

  const handleUpload = async (event, endpoint) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!selectedConversation || !file) {
      return;
    }

    setWorkingAction('upload');
    setErrorMessage('');

    try {
      await uploadConversationFile({
        endpoint,
        phoneNumber: selectedConversation.phone_number,
        file,
      });
      await loadDashboardData(selectedConversation.id, true);
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo subir el archivo.');
    } finally {
      setWorkingAction('');
    }
  };

  const handleToggleBot = async () => {
    if (!selectedConversation) {
      return;
    }

    setWorkingAction('bot');
    setErrorMessage('');

    try {
      await toggleConversationBot({
        phone_number: selectedConversation.phone_number,
        agent_active: !selectedConversation.agent_active,
      });
      await loadDashboardData(selectedConversation.id, false);
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo actualizar el estado del bot.');
    } finally {
      setWorkingAction('');
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversation) {
      return;
    }

    if (!window.confirm(`Se eliminará el chat con ${selectedConversation.user_name || selectedConversation.phone_number}.`)) {
      return;
    }

    setWorkingAction('delete-chat');
    setErrorMessage('');

    try {
      await deleteConversation({
        phone_number: selectedConversation.phone_number,
      });
      await loadDashboardData(null, true);
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo borrar el chat.');
    } finally {
      setWorkingAction('');
    }
  };

  const handleToggleTag = async (tagName) => {
    if (!selectedConversation || !tagName.trim()) {
      return;
    }

    const isAssigned = selectedConversation.tags.some((tagItem) => tagItem.name.toLowerCase() === tagName.toLowerCase());
    setWorkingAction('tags');
    setErrorMessage('');

    try {
      if (isAssigned) {
        await removeConversationTags({
          phone_number: selectedConversation.phone_number,
          tags: [tagName],
        });
      } else {
        await assignConversationTags({
          phone_number: selectedConversation.phone_number,
          tags: [tagName],
        });
      }

      setNewTagName('');
      await loadDashboardData(selectedConversation.id, false);
    } catch (error) {
      setErrorMessage(error.message || 'No se pudieron actualizar las etiquetas.');
    } finally {
      setWorkingAction('');
    }
  };

  const openCreateContactModal = () => {
    setContactDraft(emptyContactDraft);
    setIsEditingContact(false);
    setIsContactModalOpen(true);
  };

  const openEditContactModal = (contact) => {
    setContactDraft({
      name: contact.name || '',
      phone_number: contact.phone_number || '',
      email: contact.email || '',
      notes: contact.notes || '',
      bot_active: Boolean(contact.bot_active),
    });
    setIsEditingContact(true);
    setIsContactModalOpen(true);
  };

  const handleSaveContact = async () => {
    setWorkingAction('contact');
    setErrorMessage('');

    try {
      await saveContact(contactDraft);
      setIsContactModalOpen(false);
      setContactDraft(emptyContactDraft);
      await loadDashboardData(selectedConversationIdRef.current, false);
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo guardar el contacto.');
    } finally {
      setWorkingAction('');
    }
  };

  const handleDeleteContact = async (phoneNumber) => {
    if (!window.confirm(`Se eliminará el contacto ${phoneNumber}.`)) {
      return;
    }

    setWorkingAction('delete-contact');
    setErrorMessage('');

    try {
      await deleteContact(phoneNumber);
      await loadDashboardData(selectedConversationIdRef.current, false);
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo eliminar el contacto.');
    } finally {
      setWorkingAction('');
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="agent-setup-shell">
        <div className="agent-setup-card">
          <span className="setup-badge">Configuración requerida</span>
          <h1>Panel de agentes listo para conectar</h1>
          <p>
            Definí <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>, <code>SUPABASE_URL</code> y{' '}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-page">
      <div className="agent-page-topbar premium-card">
        <div>
          <span className="agent-eyebrow">{section === 'conversations' ? 'Operación en vivo' : 'Base de contactos'}</span>
          <h2 className="agent-page-title">{section === 'conversations' ? 'Panel de conversaciones' : 'Gestión de contactos'}</h2>
        </div>

        <div className="agent-page-tabs">
          <NavLink className={({ isActive }) => `agent-tab ${isActive ? 'is-active' : ''}`} to="/agente-conversaciones">
            <MessageSquareText size={16} />
            Conversaciones
          </NavLink>
          <NavLink className={({ isActive }) => `agent-tab ${isActive ? 'is-active' : ''}`} to="/agente-contactos">
            <ContactRound size={16} />
            Contactos
          </NavLink>
        </div>
      </div>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      {section === 'conversations' ? (
        <section className="conversation-layout">
          <div className="panel conversation-list-panel">
            <div className="panel-header">
              <div className="search-input agent-search-input">
                <Search size={16} />
                <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Buscar por nombre o teléfono" />
              </div>
            </div>

            <div className="tag-filter-row">
              <button className={`tag-filter ${!selectedTagFilter ? 'is-selected' : ''}`} onClick={() => setSelectedTagFilter('')}>
                Todas
              </button>
              {tags.map((tagItem) => (
                <button
                  key={tagItem.id}
                  className={`tag-filter ${selectedTagFilter === tagItem.name ? 'is-selected' : ''}`}
                  onClick={() => setSelectedTagFilter(tagItem.name)}
                  style={{ '--tag-color': tagItem.color }}
                >
                  {tagItem.name}
                </button>
              ))}
            </div>

            <div className="conversation-list">
              {loadingDashboard ? <div className="empty-state">Cargando conversaciones...</div> : null}
              {!loadingDashboard && filteredConversations.length === 0 ? <div className="empty-state">No hay conversaciones para este filtro.</div> : null}

              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`conversation-row ${selectedConversation?.id === conversation.id ? 'is-active' : ''}`}
                  onClick={() => handleSelectConversation(conversation.id)}
                >
                  <div className="avatar-circle">{getInitials(conversation.contact?.name || conversation.user_name || conversation.phone_number)}</div>
                  <div className="conversation-row-body">
                    <div className="conversation-row-top">
                      <strong>{conversation.contact?.name || conversation.user_name || 'Sin nombre'}</strong>
                      <span>{formatRelativeTime(conversation.last_message_at)}</span>
                    </div>
                    <span className="conversation-meta">{formatPhoneForDisplay(conversation.phone_number)}</span>
                    <p>{conversation.last_message_preview || 'Sin mensajes aún'}</p>
                    <div className="conversation-tags">
                      <span className={`bot-pill ${conversation.agent_active ? 'is-on' : 'is-off'}`}>
                        <Bot size={14} />
                        {conversation.agent_active ? 'Bot ON' : 'Bot OFF'}
                      </span>
                      {conversation.tags.map((tagItem) => (
                        <span key={`${conversation.id}-${tagItem.id}`} className="tag-chip" style={{ '--tag-color': tagItem.color }}>
                          {tagItem.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel chat-panel">
            {selectedConversation ? (
              <>
                <div className="chat-header">
                  <div>
                    <div className="chat-contact-title">
                      <h3>{selectedConversation.contact?.name || selectedConversation.user_name || 'Sin nombre'}</h3>
                      <span>{selectedConversation.phone_number}</span>
                    </div>
                    <div className="header-tags-inline">
                      {selectedConversation.tags.map((tagItem) => (
                        <button
                          key={`header-${tagItem.id}`}
                          className="tag-chip removable"
                          style={{ '--tag-color': tagItem.color }}
                          onClick={() => handleToggleTag(tagItem.name)}
                        >
                          {tagItem.name}
                          <X size={12} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="chat-actions">
                    <div className="tag-selector-wrapper">
                      <button className="secondary-button" onClick={() => setIsTagPopoverOpen((value) => !value)}>
                        <Tag size={16} />
                        Etiquetas
                      </button>

                      {isTagPopoverOpen ? (
                        <div className="tag-popover">
                          <div className="tag-popover-grid">
                            {tags.map((tagItem) => {
                              const isSelected = selectedConversation.tags.some((item) => item.id === tagItem.id);
                              return (
                                <button
                                  key={`tag-${tagItem.id}`}
                                  className={`tag-toggle ${isSelected ? 'is-selected' : ''}`}
                                  style={{ '--tag-color': tagItem.color }}
                                  onClick={() => handleToggleTag(tagItem.name)}
                                >
                                  {tagItem.name}
                                </button>
                              );
                            })}
                          </div>

                          <div className="tag-create-row">
                            <input value={newTagName} onChange={(event) => setNewTagName(event.target.value)} placeholder="Nueva etiqueta" />
                            <button className="secondary-button" onClick={() => handleToggleTag(newTagName)}>
                              <BadgePlus size={16} />
                              Agregar
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <button className={`toggle-button ${selectedConversation.agent_active ? 'is-on' : ''}`} onClick={handleToggleBot}>
                      <Bot size={16} />
                      {selectedConversation.agent_active ? 'Bot activo' : 'Bot detenido'}
                    </button>

                    <button className="danger-button" onClick={handleDeleteConversation}>
                      <Trash2 size={16} />
                      Eliminar
                    </button>
                  </div>
                </div>

                <div className="messages-scroller">
                  {loadingMessages ? <div className="empty-state">Cargando mensajes...</div> : null}
                  {!loadingMessages && messages.length === 0 ? <div className="empty-state">No hay mensajes en esta conversación.</div> : null}

                  {messages.map((message) => (
                    <article key={message.id} className={`message-bubble ${message.sender === 'agent' ? 'from-agent' : 'from-user'}`}>
                      <span className="message-author">{message.sender === 'agent' ? 'Agente' : 'Cliente'}</span>
                      {renderMessageBody(message)}
                      <span className="message-time">{formatTimestamp(message.created_at)}</span>
                    </article>
                  ))}
                </div>

                <div className="composer">
                  <div className="composer-tools">
                    <button className="icon-button secondary-button" onClick={() => imageInputRef.current?.click()} disabled={workingAction === 'upload'}>
                      <ImageUp size={18} />
                    </button>
                    <button className="icon-button secondary-button" onClick={() => fileInputRef.current?.click()} disabled={workingAction === 'upload'}>
                      <Paperclip size={18} />
                    </button>
                    <span className="tool-hint">
                      <Volume2 size={15} />
                      Soporta texto, links, imagen y audio
                    </span>
                  </div>

                  <div className="composer-row">
                    <textarea
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      placeholder="Escribe una respuesta para el cliente"
                      rows={3}
                    />
                    <button className="primary-button" onClick={handleSendMessage} disabled={savingMessage || !messageDraft.trim()}>
                      <SendHorizontal size={18} />
                      {savingMessage ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>

                  <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => handleUpload(event, '/api/upload-image')} />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                    hidden
                    onChange={(event) => handleUpload(event, '/api/upload-media')}
                  />
                </div>
              </>
            ) : (
              <div className="chat-empty">
                <UserRound size={28} />
                <h3>Selecciona un chat</h3>
                <p>Abre una conversación para revisar mensajes, responder y gestionar etiquetas.</p>
              </div>
            )}
          </div>

          <aside className="panel inspector-panel">
            <div className="panel-header">
              <div>
                <span className="agent-eyebrow">Detalle del chat</span>
                <h3>Ficha rápida</h3>
              </div>
            </div>

            {selectedConversation ? (
              <div className="inspector-content">
                <div className="inspector-card">
                  <span className="inspector-label">Contacto</span>
                  <strong>{selectedConversation.contact?.name || selectedConversation.user_name || 'Sin nombre'}</strong>
                  <p>{selectedConversation.phone_number}</p>
                  <p>{selectedConversation.contact?.email || 'Sin email cargado'}</p>
                </div>

                <div className="inspector-card">
                  <span className="inspector-label">Notas</span>
                  <p>{selectedConversation.contact?.notes || 'Sin notas registradas.'}</p>
                </div>

                <div className="inspector-card">
                  <span className="inspector-label">Etiquetas disponibles</span>
                  <div className="inspector-tags">
                    {tags.map((tagItem) => (
                      <button
                        key={`inspector-${tagItem.id}`}
                        className={`tag-toggle ${selectedConversation.tags.some((item) => item.id === tagItem.id) ? 'is-selected' : ''}`}
                        style={{ '--tag-color': tagItem.color }}
                        onClick={() => handleToggleTag(tagItem.name)}
                      >
                        {tagItem.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">Sin conversación seleccionada.</div>
            )}
          </aside>
        </section>
      ) : (
        <section className="contacts-layout">
          <div className="panel">
            <div className="contacts-toolbar">
              <div className="search-input agent-search-input">
                <Search size={16} />
                <input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Buscar por nombre, teléfono o email" />
              </div>

              <button className="primary-button" onClick={openCreateContactModal}>
                <BadgePlus size={18} />
                Nuevo contacto
              </button>
            </div>

            <div className="contacts-table-wrap">
              <table className="contacts-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Email</th>
                    <th>Notas</th>
                    <th>Bot</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>{contact.name || 'Sin nombre'}</td>
                      <td>{contact.phone_number}</td>
                      <td>{contact.email || '-'}</td>
                      <td>{contact.notes || '-'}</td>
                      <td>
                        <span className={`bot-pill ${contact.bot_active ? 'is-on' : 'is-off'}`}>{contact.bot_active ? 'Activo' : 'Pausado'}</span>
                      </td>
                      <td className="table-actions">
                        <button className="secondary-button" onClick={() => openEditContactModal(contact)}>
                          Editar
                        </button>
                        <button className="danger-button ghost" onClick={() => handleDeleteContact(contact.phone_number)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredContacts.length ? <div className="empty-state">No hay contactos que coincidan con la búsqueda.</div> : null}
            </div>
          </div>
        </section>
      )}

      {isContactModalOpen ? (
        <div className="modal-backdrop" onClick={() => setIsContactModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="agent-eyebrow">{isEditingContact ? 'Editar contacto' : 'Nuevo contacto'}</span>
                <h3>{isEditingContact ? 'Actualizar ficha' : 'Crear ficha manual'}</h3>
              </div>
              <button className="icon-button secondary-button" onClick={() => setIsContactModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-grid agent-form-grid">
              <label>
                Nombre
                <input value={contactDraft.name} onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre del contacto" />
              </label>
              <label>
                Teléfono
                <input
                  value={contactDraft.phone_number}
                  onChange={(event) => setContactDraft((current) => ({ ...current, phone_number: event.target.value }))}
                  placeholder="+54911..."
                />
              </label>
              <label>
                Email
                <input value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} placeholder="cliente@empresa.com" />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={contactDraft.bot_active}
                  onChange={(event) => setContactDraft((current) => ({ ...current, bot_active: event.target.checked }))}
                />
                Bot activo para este número
              </label>
              <label className="full-width">
                Notas
                <textarea
                  rows={5}
                  value={contactDraft.notes}
                  onChange={(event) => setContactDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Observaciones internas para el equipo"
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setIsContactModalOpen(false)}>
                Cancelar
              </button>
              <button className="primary-button" onClick={handleSaveContact} disabled={workingAction === 'contact'}>
                {workingAction === 'contact' ? 'Guardando...' : 'Guardar contacto'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AgentPanel;
