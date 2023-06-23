import { fetch } from '@inrupt/solid-client-authn-browser'
import dayjs from 'dayjs'
import {
  ChatShapeShapeType,
  MessageActivityShapeType,
  PrivateTypeIndexShapeType,
} from 'ldo/app.shapeTypes'
import { ChatMessageShape, ChatShape } from 'ldo/app.typings'
import { AuthorizationShapeType } from 'ldo/wac.shapeTypes'
import parseLinkHeader from 'parse-link-header'
import { publicTypeIndex } from 'rdf-namespaces/dist/solid'
import { useCallback } from 'react'
import { URI } from 'types'
import { getContainer } from 'utils/helpers'
import { acl, meeting } from 'utils/rdf-namespaces'
import * as uuid from 'uuid'
import {
  useCreateRdfDocument,
  useDeleteRdfDocument,
  useUpdateLdoDocument,
} from './useRdfDocument'

export const useCreateMessage = () => {
  const queryMutation = useUpdateLdoDocument(ChatShapeShapeType)
  return useCallback(
    async ({
      senderId,
      message,
      chat,
    }: {
      senderId: URI
      message: string
      chat: URI
    }) => {
      const container = getContainer(chat)
      const chatFile = `${container}${dayjs().format('YYYY/MM/DD')}/chat.ttl`
      const id = `${chatFile}#msg-${uuid.v4()}`
      const createdAt = new Date().toISOString()
      // create the message
      await queryMutation.mutateAsync({
        uri: getContainer(chat) + dayjs().format('YYYY/MM/DD') + '/chat.ttl',
        subject: chat,
        transform: ldo => {
          ldo.message ??= []
          ldo.message.push({
            '@id': id,
            created: createdAt,
            content: message,
            maker: { '@id': senderId },
          })
        },
      })

      return { messageId: id, todayChat: chatFile, createdAt }
    },
    [queryMutation],
  )
}

export const useCreateMessageNotification = () => {
  const queryMutation = useCreateRdfDocument(MessageActivityShapeType)
  return useCallback(
    async ({
      inbox,
      senderId,
      messageId,
      chatId,
      updated,
    }: {
      inbox: URI
      senderId: URI
      messageId: URI
      chatId: URI
      updated: string // date as isostring
    }) => {
      // create the message
      await queryMutation.mutateAsync({
        uri: inbox,
        method: 'POST',
        data: {
          '@id': '',
          // TODO dealing with weird inconsistency, probably because of issue
          // https://github.com/o-development/ldo/issues/22
          // @ts-ignore
          type: [{ '@id': 'Add' }],
          actor: { '@id': senderId },
          context: { '@id': 'https://www.pod-chat.com/LongChatMessage' },
          object: { '@id': messageId } as ChatMessageShape,
          target: { '@id': chatId } as ChatShape,
          updated,
        },
      })
    },
    [queryMutation],
  )
}

export const useCreateChat = () => {
  const createChatMutation = useCreateRdfDocument(ChatShapeShapeType)
  const createAclMutation = useCreateRdfDocument(AuthorizationShapeType)
  const updatePrivateMutation = useUpdateLdoDocument(PrivateTypeIndexShapeType)
  return useCallback(
    async ({
      me,
      otherPerson,
      otherChat,
      hospexContainer,
      privateTypeIndex,
    }: {
      me: URI
      otherPerson: URI
      otherChat?: URI
      hospexContainer: URI
      privateTypeIndex: URI
    }) => {
      // create index.ttl on my pod and fill it with info
      const chatContainer = `${hospexContainer}messages/${uuid.v4()}/`
      const chatFile = `${chatContainer}index.ttl`
      const chatId = `${chatFile}#this`
      const date = new Date().toISOString()

      // save chat
      await createChatMutation.mutateAsync({
        uri: chatFile,
        data: {
          '@id': chatId,
          type: { '@id': 'LongChat' },
          author: { '@id': me },
          created2: date,
          title: 'Hospex chat channel',
          participation: [
            {
              '@id': `${chatFile}#${uuid.v4()}`,
              dtstart: date,
              participant: { '@id': me },
            },
            {
              '@id': `${chatFile}#${uuid.v4()}`,
              dtstart: date,
              participant: { '@id': otherPerson },
              references: otherChat ? [{ '@id': otherChat } as ChatShape] : [],
            },
          ],
        },
      })
      // set permissions
      const response = await fetch(chatContainer, { method: 'HEAD' })
      const linkHeader = response.headers.get('link')
      const links = parseLinkHeader(linkHeader)
      const aclUri = links?.acl?.url
      if (!aclUri)
        throw new Error('We could not find WAC link for a given resource')

      await createAclMutation.mutateAsync({
        uri: aclUri,
        data: [
          {
            '@id': aclUri + '#ReadWriteControl',
            type: { '@id': 'Authorization' },
            agent: [{ '@id': me }],
            accessTo: [{ '@id': chatContainer }],
            default: { '@id': chatContainer },
            mode: [
              { '@id': acl.Read },
              { '@id': acl.Write },
              { '@id': acl.Control },
            ],
          },
          {
            '@id': aclUri + '#Read',
            type: { '@id': 'Authorization' },
            agent: [{ '@id': otherPerson }],
            accessTo: [{ '@id': chatContainer }],
            default: { '@id': chatContainer },
            mode: [{ '@id': acl.Read }],
          },
        ],
      })

      // save to privateTypeIndex
      await updatePrivateMutation.mutateAsync({
        uri: privateTypeIndex,
        subject: privateTypeIndex,
        transform: ldo => {
          // find or create type registration for LongChat
          const typeRegistration = ldo.references?.find(registration =>
            registration.forClass.some(
              fc => fc['@id'] === meeting.LongChat || fc['@id'] === 'LongChat',
            ),
          )

          if (typeRegistration) {
            typeRegistration.instance ??= []
            typeRegistration.instance.push({ '@id': chatId })
          } else {
            ldo.references ??= []
            ldo.references.push({
              '@id': publicTypeIndex + '#' + uuid.v4(),
              type: { '@id': 'TypeRegistration' },
              forClass: [{ '@id': 'LongChat' }],
              instance: [{ '@id': chatId }],
            })
          }
        },
      })
      return { chatContainer, chatFile, chatId }
    },
    [createAclMutation, createChatMutation, updatePrivateMutation],
  )
}

/**
 *
 * @param chat - chat of person receiving notification
 * @param otherChat - chat of person sending notification
 * @param otherPerson - person sending notification
 */
export const useProcessNotification = () => {
  const updateChat = useUpdateLdoDocument(ChatShapeShapeType)
  const deleteNotification = useDeleteRdfDocument()
  return useCallback(
    async ({
      notificationId,
      chat,
      otherChat,
      otherPerson,
    }: {
      notificationId: URI
      chat: URI
      otherChat: URI
      otherPerson: URI
    }) => {
      // we need to have notification info
      // at this point my chat must exist
      // and we add other chat to my chat as referenced chat
      // TODO check that otherChat correctly references this chat, and only this chat, or references nothing
      await updateChat.mutateAsync({
        uri: chat,
        subject: chat,
        transform: ldo => {
          if (!ldo.participation) throw new Error('no participation')
          if (ldo.participation && ldo.participation.length > 2)
            throw new Error('too much participation (only 2 people supported!)')
          const participation = ldo.participation?.find(
            p => p.participant?.['@id'] === otherPerson,
          )

          if (!participation)
            throw new Error("other person's participation not found")
          if (participation.references && participation.references?.length > 0)
            throw new Error('participation alread references some other chat')

          participation.references = [{ '@id': otherChat } as ChatShape]
        },
      })

      await deleteNotification.mutateAsync({ uri: notificationId })
    },
    [deleteNotification, updateChat],
  )
}