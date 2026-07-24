import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgePlus, Bot, ChevronDown, Clock3, ContactRound, ImageUp, Mail, MoreHorizontal, MessageSquareText, Paperclip, Pause, Phone, Play, Search, SendHorizontal, Tag, Trash2, UserRound, Volume2, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { formatPhoneForDisplay, formatRelativeTime, formatTimeOnly, formatTimestamp, getInitials, splitTextWithLinks } from '../lib/formatters';
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

const CONTACTS_PAGE_SIZE = 10;

const formatAudioTime = (value) => {
  const totalSeconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const MessageAudioPlayer = ({ src }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    const syncDuration = () => setDuration(audio.duration || 0);
    const syncCurrentTime = () => setCurrentTime(audio.currentTime || 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('timeupdate', syncCurrentTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('timeupdate', syncCurrentTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
      return;
    }

    audio.pause();
    setIsPlaying(false);
  };

  const handleSeek = (event) => {
    const nextTime = Number(event.target.value);
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="audio-player-shell">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" className="audio-play-button" onClick={togglePlayback} aria-label={isPlaying ? 'Pausar audio' : 'Reproducir audio'}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
      </button>
      <div className="audio-player-track">
        <div className="audio-waveform" aria-hidden="true">
          <span />
        </div>
        <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={handleSeek} style={{ '--progress': `${progress}%` }} />
      </div>
      <span className="audio-duration">{formatAudioTime(duration || currentTime)}</span>
    </div>
  );
};

const renderMessageBody = (message, onOpenImage) => {
  if (message.message_type === 'image' && message.media_url) {
    return (
      <div className="message-media-stack">
        <button type="button" className="message-image-trigger" onClick={() => onOpenImage?.(message)}>
          <img className="message-image" src={message.media_url} alt={message.content || 'Imagen adjunta'} />
        </button>
        {message.content ? <p>{message.content}</p> : null}
      </div>
    );
  }

  if (message.message_type === 'audio' && message.media_url) {
    return (
      <div className="message-media-stack">
        <MessageAudioPlayer src={message.media_url} />
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

const formatMessageGroupLabel = (value) =>
  new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));

const AgentPanel = ({ section = 'conversations' }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tags, setTags] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [currentContactsPage, setCurrentContactsPage] = useState(1);
  const [messageDraft, setMessageDraft] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [loadingDashboard, setLoadingDashboard] = useState(isSupabaseConfigured);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [workingAction, setWorkingAction] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [openContactActionId, setOpenContactActionId] = useState(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState(emptyContactDraft);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [zoomedMessage, setZoomedMessage] = useState(null);
  const [isInspectorModalOpen, setIsInspectorModalOpen] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState([]);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const actionMenuRef = useRef(null);
  const selectedConversationIdRef = useRef(null);
  const messagesEndRef = useRef(null);

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

  const totalContactPages = useMemo(() => Math.max(1, Math.ceil(filteredContacts.length / CONTACTS_PAGE_SIZE)), [filteredContacts.length]);

  const activeContactsPage = Math.min(currentContactsPage, totalContactPages);

  const paginatedContacts = useMemo(() => {
    const startIndex = (activeContactsPage - 1) * CONTACTS_PAGE_SIZE;
    return filteredContacts.slice(startIndex, startIndex + CONTACTS_PAGE_SIZE);
  }, [activeContactsPage, filteredContacts]);

  const contactsRangeLabel = useMemo(() => {
    if (!filteredContacts.length) {
      return '0 de 0';
    }

    const start = (activeContactsPage - 1) * CONTACTS_PAGE_SIZE + 1;
    const end = Math.min(activeContactsPage * CONTACTS_PAGE_SIZE, filteredContacts.length);
    return `${start}-${end} de ${filteredContacts.length}`;
  }, [activeContactsPage, filteredContacts.length]);

  const groupedMessages = useMemo(() => {
    return messages.reduce((groups, message) => {
      const groupKey = new Date(message.created_at).toDateString();
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.key !== groupKey) {
        groups.push({
          key: groupKey,
          label: formatMessageGroupLabel(message.created_at),
          items: [message],
        });
      } else {
        lastGroup.items.push(message);
      }

      return groups;
    }, []);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [groupedMessages, selectedConversationId]);

  useEffect(() => {
    if (!isActionMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (actionMenuRef.current?.contains(event.target)) {
        return;
      }

      setIsActionMenuOpen(false);
      setIsTagPopoverOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isActionMenuOpen]);

  useEffect(() => {
    if (!openContactActionId) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (event.target.closest('.contact-row-menu')) {
        return;
      }

      setOpenContactActionId(null);
    };

    window.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [openContactActionId]);

  const handleSelectConversation = async (conversationId) => {
    setSelectedConversationId(conversationId);
    setIsTagPopoverOpen(false);
    setIsActionMenuOpen(false);
    setIsInspectorModalOpen(false);
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

  const handleToggleBulkSelection = (conversationId, event) => {
    event.stopPropagation();
    setSelectedForBulk((prev) =>
      prev.includes(conversationId)
        ? prev.filter((id) => id !== conversationId)
        : [...prev, conversationId]
    );
  };

  const handleBulkToggleBot = async (turnOn) => {
    if (selectedForBulk.length === 0) return;
    
    setWorkingAction('bot');
    setErrorMessage('');
    
    try {
      const selectedConvos = conversations.filter((c) => selectedForBulk.includes(c.id));
      await Promise.all(
        selectedConvos.map((c) =>
          toggleConversationBot({
            phone_number: c.phone_number,
            agent_active: turnOn,
          })
        )
      );
      setSelectedForBulk([]);
      await loadDashboardData(selectedConversationIdRef.current, false);
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo actualizar el bot de los chats seleccionados.');
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

  const renderInspectorContent = () => {
    if (!selectedConversation) {
      return <div className="empty-state">Sin conversación seleccionada.</div>;
    }

    return (
      <div className="inspector-content">
        <div className="inspector-card">
          <span className="inspector-label">Contacto</span>
          <strong>{selectedConversation.contact?.name || selectedConversation.user_name || 'Sin nombre'}</strong>
          <div className="detail-list">
            <span className="detail-item">
              <Phone size={14} />
              {formatPhoneForDisplay(selectedConversation.phone_number)}
            </span>
            <span className="detail-item">
              <Mail size={14} />
              {selectedConversation.contact?.email || 'Sin email cargado'}
            </span>
          </div>
        </div>

        <div className="inspector-card">
          <span className="inspector-label">Notas</span>
          <p className="inspector-text-block">{selectedConversation.contact?.notes || 'Sin notas registradas.'}</p>
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
    );
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
              <div className="panel-heading-row">
                <div>
                  <span className="section-label">Bandeja</span>
                  <h3 className="panel-title">Conversaciones activas</h3>
                </div>
                <span className="panel-counter">{filteredConversations.length}</span>
              </div>

              <div className="search-input agent-search-input">
                <Search size={16} />
                <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Buscar por nombre, teléfono o contenido" />
              </div>
            </div>

            <div className="tag-filter-row">
              <span className="section-label">Filtrar por etiqueta</span>
              <div className="tag-filter-scroll">
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
            </div>

            {selectedForBulk.length > 0 && (
              <div className="bulk-action-bar">
                <span className="bulk-counter">{selectedForBulk.length} seleccionados</span>
                <div className="bulk-actions">
                  <button className="primary-button small" onClick={() => handleBulkToggleBot(true)}>
                    <Bot size={14} /> ON
                  </button>
                  <button className="secondary-button small" onClick={() => handleBulkToggleBot(false)}>
                    <Bot size={14} /> OFF
                  </button>
                  <button className="icon-button" onClick={() => setSelectedForBulk([])} aria-label="Limpiar selección">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="conversation-list">
              {loadingDashboard ? <div className="empty-state">Cargando conversaciones...</div> : null}
              {!loadingDashboard && filteredConversations.length === 0 ? <div className="empty-state">No hay conversaciones para este filtro.</div> : null}

              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`conversation-row ${selectedConversation?.id === conversation.id ? 'is-active' : ''} ${selectedForBulk.includes(conversation.id) ? 'is-selected-bulk' : ''}`}
                  onClick={() => handleSelectConversation(conversation.id)}
                >
                  <div className="conversation-row-select" onClick={(e) => handleToggleBulkSelection(conversation.id, e)}>
                    <input type="checkbox" checked={selectedForBulk.includes(conversation.id)} readOnly />
                  </div>
                  <div className="avatar-circle conversation-avatar">{getInitials(conversation.contact?.name || conversation.user_name || conversation.phone_number)}</div>
                  <div className="conversation-row-body">
                    <div className="conversation-row-top">
                      <strong>{conversation.contact?.name || conversation.user_name || 'Sin nombre'}</strong>
                      <span>{formatTimeOnly(conversation.last_message_at)}</span>
                    </div>
                    <div className="conversation-meta-line">
                      <span className="conversation-meta">{formatPhoneForDisplay(conversation.phone_number)}</span>
                      <span className={`status-dot ${conversation.agent_active ? 'is-on' : 'is-off'}`} />
                    </div>
                    <p>{conversation.last_message_preview || 'Sin mensajes aún'}</p>
                    <div className="conversation-tags">
                      <span className={`bot-pill ${conversation.agent_active ? 'is-on' : 'is-off'}`}>
                        <Bot size={14} />
                        {conversation.agent_active ? 'Bot ON' : 'Bot OFF'}
                      </span>
                      {conversation.tags.slice(0, 1).map((tagItem) => (
                        <span key={`${conversation.id}-${tagItem.id}`} className="tag-chip" style={{ '--tag-color': tagItem.color }}>
                          {tagItem.name}
                        </span>
                      ))}
                      {conversation.tags.length > 1 ? <span className="tag-chip tag-chip-muted">+{conversation.tags.length - 1}</span> : null}
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
                  <div className="chat-header-main">
                    <div className="avatar-circle chat-avatar">{getInitials(selectedConversation.contact?.name || selectedConversation.user_name || selectedConversation.phone_number)}</div>
                    <div>
                      <div className="chat-contact-title">
                        <h3>{selectedConversation.contact?.name || selectedConversation.user_name || 'Sin nombre'}</h3>
                      </div>
                      <div className="chat-header-meta">
                        <span className={`bot-pill ${selectedConversation.agent_active ? 'is-on' : 'is-off'}`}>
                          <Bot size={14} />
                          {selectedConversation.agent_active ? 'Bot activo' : 'Bot pausado'}
                        </span>
                        <span className="meta-inline">
                          <Phone size={14} />
                          {formatPhoneForDisplay(selectedConversation.phone_number)}
                        </span>
                        {selectedConversation.contact?.email ? (
                          <span className="meta-inline">
                            <Mail size={14} />
                            {selectedConversation.contact.email}
                          </span>
                        ) : null}
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
                  </div>

                  <div className="chat-actions">
                    <div ref={actionMenuRef} className={`action-menu-wrapper ${isActionMenuOpen ? 'is-open' : ''}`}>
                      <button
                        className="secondary-button action-menu-trigger"
                        onClick={() => {
                          setIsActionMenuOpen((value) => !value);
                          setIsTagPopoverOpen(false);
                        }}
                        aria-expanded={isActionMenuOpen}
                      >
                        <ChevronDown size={16} />
                        Acciones
                      </button>

                      {isActionMenuOpen ? (
                        <div className="action-menu-dropdown">
                          <button
                            className="secondary-button action-menu-item"
                            onClick={() => {
                              setIsInspectorModalOpen(true);
                              setIsActionMenuOpen(false);
                            }}
                          >
                            <ContactRound size={16} />
                            Ficha r&aacute;pida
                          </button>

                          <div className="tag-selector-wrapper action-menu-group">
                            <button className="secondary-button action-menu-item" onClick={() => setIsTagPopoverOpen((value) => !value)}>
                              <Tag size={16} />
                              Etiquetas
                            </button>

                            {isTagPopoverOpen ? (
                              <div className="tag-popover action-tag-popover">
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

                          <button
                            className={`toggle-button action-menu-item ${selectedConversation.agent_active ? 'is-on' : ''}`}
                            onClick={() => {
                              setIsActionMenuOpen(false);
                              setIsTagPopoverOpen(false);
                              handleToggleBot();
                            }}
                          >
                            <Bot size={16} />
                            {selectedConversation.agent_active ? 'Bot activo' : 'Bot detenido'}
                          </button>

                          <button
                            className="danger-button action-menu-item"
                            onClick={() => {
                              setIsActionMenuOpen(false);
                              setIsTagPopoverOpen(false);
                              handleDeleteConversation();
                            }}
                          >
                            <Trash2 size={16} />
                            Eliminar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="messages-scroller">
                  {loadingMessages ? <div className="empty-state">Cargando mensajes...</div> : null}
                  {!loadingMessages && messages.length === 0 ? <div className="empty-state">No hay mensajes en esta conversación.</div> : null}

                  {groupedMessages.map((group) => (
                    <div key={group.key} className="message-group">
                      <div className="message-group-label">{group.label}</div>

                      {group.items.map((message) => (
                        <article key={message.id} className={`message-bubble ${message.sender === 'agent' ? 'from-agent' : 'from-user'}`}>
                          <span className="message-author">{message.sender === 'agent' ? 'Agente' : 'Cliente'}</span>
                          {renderMessageBody(message, setZoomedMessage)}
                          <span className="message-time">{formatTimestamp(message.created_at)}</span>
                        </article>
                      ))}
                    </div>
                  ))}

                  <div ref={messagesEndRef} />
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
                    <span className="tool-hint subtle">Ctrl + Enter para enviar</span>
                  </div>

                  <div className="composer-row">
                    <textarea
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                          event.preventDefault();
                          handleSendMessage();
                        }
                      }}
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

            {renderInspectorContent()}
          </aside>
        </section>
      ) : (
        <section className="contacts-layout">
          <div className="panel">
            <div className="contacts-toolbar">
              <div className="contacts-toolbar-copy">
                <div>
                  <span className="section-label">Agenda comercial</span>
                  <h3 className="panel-title">Contactos operativos</h3>
                </div>
                <div className="search-input agent-search-input">
                  <Search size={16} />
                  <input
                    value={contactSearch}
                    onChange={(event) => {
                      setContactSearch(event.target.value);
                      setCurrentContactsPage(1);
                    }}
                    placeholder="Buscar por nombre, teléfono, email o notas"
                  />
                </div>
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
                    <th>Contacto</th>
                    <th>Canales</th>
                    <th>Notas</th>
                    <th>Bot</th>
                    <th>Actualizado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {paginatedContacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>
                        <div className="contact-cell">
                          <div className="avatar-circle contact-avatar">{getInitials(contact.name || contact.phone_number)}</div>
                          <div className="contact-primary">
                            <strong>{contact.name || 'Sin nombre'}</strong>
                            <span>{formatPhoneForDisplay(contact.phone_number)}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="contact-channel-list">
                          <span className="detail-item">
                            <Phone size={14} />
                            {formatPhoneForDisplay(contact.phone_number)}
                          </span>
                          <span className="detail-item">
                            <Mail size={14} />
                            {contact.email || 'Sin email'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <p className="contact-notes">{contact.notes || 'Sin notas registradas.'}</p>
                      </td>
                      <td>
                        <span className={`bot-pill ${contact.bot_active ? 'is-on' : 'is-off'}`}>{contact.bot_active ? 'Activo' : 'Pausado'}</span>
                      </td>
                      <td className="muted-cell">
                        <span className="detail-item">
                          <Clock3 size={14} />
                          {formatRelativeTime(contact.updated_at)}
                        </span>
                      </td>
                      <td className="table-actions">
                        <div className={`contact-row-menu ${openContactActionId === contact.id ? 'is-open' : ''}`}>
                          <button
                            className="icon-button secondary-button contact-row-menu-trigger"
                            onClick={() => setOpenContactActionId((currentId) => (currentId === contact.id ? null : contact.id))}
                            aria-expanded={openContactActionId === contact.id}
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          {openContactActionId === contact.id ? (
                            <div className="contact-row-menu-dropdown">
                              <button
                                className="secondary-button contact-row-menu-item"
                                onClick={() => {
                                  openEditContactModal(contact);
                                  setOpenContactActionId(null);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                className="danger-button ghost contact-row-menu-item"
                                onClick={() => {
                                  handleDeleteContact(contact.phone_number);
                                  setOpenContactActionId(null);
                                }}
                              >
                                Eliminar
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredContacts.length ? <div className="empty-state">No hay contactos que coincidan con la búsqueda.</div> : null}

              {filteredContacts.length ? (
                <div className="contacts-pagination">
                  <span className="pagination-status">{contactsRangeLabel}</span>
                  <div className="pagination-controls">
                    <button
                      className="secondary-button"
                      onClick={() => setCurrentContactsPage((page) => Math.max(1, Math.min(page, totalContactPages) - 1))}
                      disabled={activeContactsPage === 1}
                    >
                      Anterior
                    </button>
                    <span className="pagination-page-indicator">
                      P&aacute;gina {activeContactsPage} de {totalContactPages}
                    </span>
                    <button
                      className="secondary-button"
                      onClick={() => setCurrentContactsPage((page) => Math.min(totalContactPages, Math.min(page, totalContactPages) + 1))}
                      disabled={activeContactsPage === totalContactPages}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              ) : null}
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

      {zoomedMessage?.media_url ? (
        <div className="modal-backdrop media-lightbox" onClick={() => setZoomedMessage(null)}>
          <div className="media-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="agent-eyebrow">Vista ampliada</span>
                <h3>{zoomedMessage.content || 'Imagen del chat'}</h3>
              </div>
              <button className="icon-button secondary-button" onClick={() => setZoomedMessage(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="media-lightbox-body">
              <img className="media-lightbox-image" src={zoomedMessage.media_url} alt={zoomedMessage.content || 'Imagen ampliada'} />
            </div>

            <div className="modal-actions">
              <span className="tool-hint">{formatTimestamp(zoomedMessage.created_at)}</span>
              <a className="secondary-button" href={zoomedMessage.media_url} target="_blank" rel="noreferrer">
                Abrir original
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {isInspectorModalOpen && selectedConversation ? (
        <div className="modal-backdrop inspector-mobile-backdrop" onClick={() => setIsInspectorModalOpen(false)}>
          <div className="modal-card inspector-mobile-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="agent-eyebrow">Detalle del chat</span>
                <h3>Ficha rápida</h3>
              </div>
              <button className="icon-button secondary-button" onClick={() => setIsInspectorModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            {renderInspectorContent()}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AgentPanel;
