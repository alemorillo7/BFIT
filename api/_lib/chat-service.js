import { buildMessagePreview, detectMessageType, normalizePhoneNumber, normalizeTagKey, randomTagColor, sanitizeTagName } from '../../shared/chat.js';
import { supabaseAdmin } from './supabase.js';

const getContactByPhone = async (phoneNumber) => {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id, name, phone_number, email, notes, bot_active')
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const getConversationByPhone = async (phoneNumber) => {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, phone_number, user_name, agent_active, contact_id')
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const ensureContactAndConversation = async ({ phoneNumber, userName = '', agentActive = true }) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('El teléfono es obligatorio.');
  }

  const safeUserName = String(userName || '').trim();
  let contact = await getContactByPhone(normalizedPhone);

  if (!contact) {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .insert({
        name: safeUserName || normalizedPhone,
        phone_number: normalizedPhone,
        bot_active: agentActive,
      })
      .select('id, name, phone_number, email, notes, bot_active')
      .single();

    if (error) {
      throw error;
    }

    contact = data;
  } else if (safeUserName && contact.name !== safeUserName) {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .update({ name: safeUserName, updated_at: new Date().toISOString() })
      .eq('id', contact.id)
      .select('id, name, phone_number, email, notes, bot_active')
      .single();

    if (error) {
      throw error;
    }

    contact = data;
  }

  let conversation = await getConversationByPhone(normalizedPhone);

  if (!conversation) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        contact_id: contact.id,
        phone_number: normalizedPhone,
        user_name: safeUserName || contact.name || normalizedPhone,
        agent_active: contact.bot_active ?? agentActive,
      })
      .select('id, phone_number, user_name, agent_active, contact_id')
      .single();

    if (error) {
      throw error;
    }

    conversation = data;
  } else {
    const updates = {};

    if (conversation.contact_id !== contact.id) {
      updates.contact_id = contact.id;
    }

    if (safeUserName && conversation.user_name !== safeUserName) {
      updates.user_name = safeUserName;
    }

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabaseAdmin
        .from('conversations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', conversation.id)
        .select('id, phone_number, user_name, agent_active, contact_id')
        .single();

      if (error) {
        throw error;
      }

      conversation = data;
    }
  }

  return {
    contact,
    conversation,
    phoneNumber: normalizedPhone,
  };
};

export const createMessageRecord = async ({
  phoneNumber,
  userName = '',
  message = '',
  sender,
  mediaUrl = null,
  mimeType = '',
  fileName = '',
  metadata = {},
}) => {
  const safeSender = sender === 'agent' ? 'agent' : 'user';
  const { conversation, phoneNumber: normalizedPhone } = await ensureContactAndConversation({
    phoneNumber,
    userName,
  });
  const messageType = detectMessageType({ message, mimeType });
  const createdAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender: safeSender,
      content: String(message || '').trim(),
      message_type: messageType,
      media_url: mediaUrl,
      mime_type: mimeType || null,
      metadata: metadata || {},
      created_at: createdAt,
    })
    .select('id, conversation_id, sender, content, message_type, media_url, mime_type, metadata, created_at')
    .single();

  if (error) {
    throw error;
  }

  const preview = buildMessagePreview({ message, messageType, fileName });
  const { error: conversationError } = await supabaseAdmin
    .from('conversations')
    .update({
      last_message_preview: preview,
      last_message_at: createdAt,
      updated_at: createdAt,
      user_name: userName?.trim() || conversation.user_name,
    })
    .eq('id', conversation.id);

  if (conversationError) {
    throw conversationError;
  }

  return {
    phone_number: normalizedPhone,
    conversation_id: conversation.id,
    message: data,
  };
};

export const getBotStatusByPhone = async (phoneNumber) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('El teléfono es obligatorio.');
  }

  const conversation = await getConversationByPhone(normalizedPhone);
  const contact = await getContactByPhone(normalizedPhone);

  return {
    phone_number: normalizedPhone,
    agent_active: conversation?.agent_active ?? contact?.bot_active ?? true,
  };
};

export const setBotStatus = async (phoneNumber, agentActive) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('El teléfono es obligatorio.');
  }

  const safeStatus = Boolean(agentActive);

  const { error: contactError } = await supabaseAdmin
    .from('contacts')
    .update({ bot_active: safeStatus, updated_at: new Date().toISOString() })
    .eq('phone_number', normalizedPhone);

  if (contactError) {
    throw contactError;
  }

  const { error: conversationError } = await supabaseAdmin
    .from('conversations')
    .update({ agent_active: safeStatus, updated_at: new Date().toISOString() })
    .eq('phone_number', normalizedPhone);

  if (conversationError) {
    throw conversationError;
  }

  return {
    phone_number: normalizedPhone,
    agent_active: safeStatus,
  };
};

const upsertTags = async (tags = []) => {
  const cleanTags = Array.from(
    new Set(
      tags
        .map((tag) => sanitizeTagName(tag))
        .filter(Boolean),
    ),
  );

  if (!cleanTags.length) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('tags')
    .upsert(
      cleanTags.map((tag) => ({
        name: tag,
        normalized_name: normalizeTagKey(tag),
        color: randomTagColor(tag),
      })),
      { onConflict: 'normalized_name' },
    )
    .select('id, name, normalized_name, color');

  if (error) {
    throw error;
  }

  return data || [];
};

export const assignTagsToConversation = async (phoneNumber, tags = []) => {
  const { conversation, phoneNumber: normalizedPhone } = await ensureContactAndConversation({ phoneNumber });
  const tagRows = await upsertTags(tags);

  if (!tagRows.length) {
    throw new Error('Debes enviar al menos una etiqueta válida.');
  }

  const { error } = await supabaseAdmin.from('conversation_tags').upsert(
    tagRows.map((tagRow) => ({
      conversation_id: conversation.id,
      tag_id: tagRow.id,
    })),
    { onConflict: 'conversation_id,tag_id' },
  );

  if (error) {
    throw error;
  }

  return {
    phone_number: normalizedPhone,
    tags: tagRows.map((tagRow) => tagRow.name),
  };
};

export const removeTagsFromConversation = async (phoneNumber, tags = []) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const cleanTags = Array.from(
    new Set(
      tags
        .map((tag) => normalizeTagKey(tag))
        .filter(Boolean),
    ),
  );

  if (!normalizedPhone || !cleanTags.length) {
    throw new Error('Debes enviar teléfono y etiquetas válidas.');
  }

  const conversation = await getConversationByPhone(normalizedPhone);
  if (!conversation) {
    return {
      phone_number: normalizedPhone,
      removed: [],
    };
  }

  const { data: tagRows, error: tagError } = await supabaseAdmin
    .from('tags')
    .select('id, normalized_name')
    .in('normalized_name', cleanTags);

  if (tagError) {
    throw tagError;
  }

  if (!tagRows?.length) {
    return {
      phone_number: normalizedPhone,
      removed: [],
    };
  }

  const { error } = await supabaseAdmin
    .from('conversation_tags')
    .delete()
    .eq('conversation_id', conversation.id)
    .in('tag_id', tagRows.map((row) => row.id));

  if (error) {
    throw error;
  }

  return {
    phone_number: normalizedPhone,
    removed: cleanTags,
  };
};

export const deleteConversationByPhone = async (phoneNumber) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('El teléfono es obligatorio.');
  }

  const { error } = await supabaseAdmin.from('conversations').delete().eq('phone_number', normalizedPhone);
  if (error) {
    throw error;
  }

  return {
    phone_number: normalizedPhone,
    deleted: true,
  };
};

export const upsertContact = async ({ name = '', phone_number, email = '', notes = '', bot_active = true }) => {
  const normalizedPhone = normalizePhoneNumber(phone_number);
  if (!normalizedPhone) {
    throw new Error('El teléfono es obligatorio.');
  }

  const payload = {
    name: String(name || '').trim() || normalizedPhone,
    phone_number: normalizedPhone,
    email: String(email || '').trim() || null,
    notes: String(notes || '').trim() || null,
    bot_active: Boolean(bot_active),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .upsert(payload, { onConflict: 'phone_number' })
    .select('id, name, phone_number, email, notes, bot_active, updated_at')
    .single();

  if (error) {
    throw error;
  }

  const { error: conversationError } = await supabaseAdmin
    .from('conversations')
    .update({
      user_name: payload.name,
      agent_active: payload.bot_active,
      updated_at: payload.updated_at,
    })
    .eq('phone_number', normalizedPhone);

  if (conversationError) {
    throw conversationError;
  }

  return data;
};

export const deleteContactByPhone = async (phoneNumber) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('El teléfono es obligatorio.');
  }

  const { error: conversationError } = await supabaseAdmin
    .from('conversations')
    .update({ contact_id: null, updated_at: new Date().toISOString() })
    .eq('phone_number', normalizedPhone);

  if (conversationError) {
    throw conversationError;
  }

  const { error } = await supabaseAdmin.from('contacts').delete().eq('phone_number', normalizedPhone);
  if (error) {
    throw error;
  }

  return {
    phone_number: normalizedPhone,
    deleted: true,
  };
};

export const listContacts = async () => {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id, name, phone_number, email, notes, bot_active, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const uploadMediaAsset = async ({ file, phoneNumber, sender = 'agent', bucket, contentType = '' }) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('El teléfono es obligatorio.');
  }

  if (!file) {
    throw new Error('Debes adjuntar un archivo.');
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const filePath = `${normalizedPhone.replace('+', '')}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(filePath, fileBuffer, {
    contentType: contentType || file.type || 'application/octet-stream',
    upsert: false,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);

  return createMessageRecord({
    phoneNumber: normalizedPhone,
    sender,
    mediaUrl: data.publicUrl,
    mimeType: contentType || file.type || 'application/octet-stream',
    fileName: file.name,
    metadata: {
      bucket,
      file_name: file.name,
      storage_path: filePath,
    },
  });
};
