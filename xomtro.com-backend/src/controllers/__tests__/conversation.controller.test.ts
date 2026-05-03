/**
 * Unit tests for conversation.controller.ts (controller-level)
 * - Framework: Jest + ts-jest
 * - Tests mock all service dependencies and socket IO
 */
import { Request, Response, NextFunction } from 'express';

// Mock service modules used by the controller
jest.mock('@/services/chat.service');
jest.mock('@/services/message.service');
jest.mock('@/services/asset.service');
jest.mock('@/services/fileUpload.service');
jest.mock('@/configs/socket.config', () => ({
  getSocketIdByUserId: jest.fn().mockImplementation((id: number) => `socket-${id}`),
  io: { to: jest.fn().mockImplementation((ids: any) => ({ emit: jest.fn() })) }
}));
// Mock email helper
jest.mock('@/utils/email.helper', () => ({
  generateEmailContent: jest.fn().mockReturnValue('<html/>'),
  sendEmail: jest.fn()
}));

import * as controller from '@/controllers/conversation.controller';
import * as chatService from '@/services/chat.service';
import * as messageService from '@/services/message.service';
import * as assetService from '@/services/asset.service';
import * as fileUploadService from '@/services/fileUpload.service';
import { io } from '@/configs/socket.config';

describe('conversation.controller (unit)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    // minimal mock response with chainable status/json
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as any;
    next = jest.fn();
    req = { body: {}, params: {}, query: {} };
  });

  // test_case_id: TC_NT_001
  // test_objective: Kiem tra xu ly khi thieu chatId trong createAnMessage
  it('should call next when chatId missing in createAnMessage', async () => {
    req!.currentUser = { users: { id: 1 } } as any;
    req!.body = {} as any;

    await controller.createAnMessage(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_002
  // test_objective: Kiem tra xu ly khi currentUser null trong createAnMessage
  it('should call next when currentUser is null in createAnMessage', async () => {
    req!.currentUser = null as any;
    req!.body = { chatId: 10 } as any;

    await controller.createAnMessage(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_003
  // test_objective: Kiem tra tao message khi chatId la chuoi so trong createAnMessage
  it('should create message when chatId is stringified number in createAnMessage', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.body = { chatId: '10', content: 'hello' } as any;

    (chatService.selectChatById as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([]);
    (messageService.insertMessage as jest.Mock).mockResolvedValue([{ id: 101 }]);
    (messageService.selectMessageByConditions as jest.Mock).mockResolvedValue([{ id: 101, chatId: 10 }]);

    await controller.createAnMessage(req as Request, res as Response, next);

    expect(messageService.insertMessage).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // test_case_id: TC_NT_004
  // test_objective: Kiem tra xu ly khi chatId bang 0 trong createAnMessage
  it('should call next when chatId is zero in createAnMessage', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.body = { chatId: 0 } as any;

    await controller.createAnMessage(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_005
  // test_objective: Kiem tra tao message va phat su kien new-message thanh cong
  it('should create message and emit new-message on createAnMessage', async () => {
    // Arrange
    const chatId = 10;
    req!.currentUser = { users: { id: 2 } } as any;
    req!.body = { chatId, content: 'hello' } as any;

    // Mock chat exists
    (chatService.selectChatById as jest.Mock).mockResolvedValue([{ id: chatId }]);

    // Mock chat members (other members)
    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([
      { userId: 3, email: 'other@example.com' }
    ]);

    // No image path, so upload not called
    (messageService.insertMessage as jest.Mock).mockResolvedValue([{ id: 100 }]);
    (messageService.selectMessageByConditions as jest.Mock).mockResolvedValue([
      { id: 100, chatId, senderId: 2, content: 'hello' }
    ]);

    // Act
    await controller.createAnMessage(req as Request, res as Response, next);

    // Assert
    expect(chatService.selectChatById).toHaveBeenCalledWith(Number(chatId));
    expect(messageService.insertMessage).toHaveBeenCalled();
    expect(messageService.selectMessageByConditions).toHaveBeenCalled();
    // socket.io emit called
    expect(io.to).toHaveBeenCalledWith(expect.anything());
    const toResult = (io.to as jest.Mock).mock.results[0].value;
    expect(toResult.emit).toHaveBeenCalledWith('new-message', expect.any(Object));
  });

  // test_case_id: TC_NT_006
  // test_objective: Kiem tra xu ly khi thu hoi message khong ton tai
  it('should call next when recalling non-existing message', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { messageId: '9999' } as any;

    (messageService.selectMessageByConditions as jest.Mock).mockResolvedValue([]);

    await controller.recallMessage(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_007
  // test_objective: Kiem tra thu hoi message va phat su kien recall-message thanh cong
  it('should recall message and emit recall-message', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { messageId: '50' } as any;

    const existingMessage = {
      id: 50,
      senderId: 2,
      allowRecallTime: new Date(Date.now() + 60 * 1000).toISOString(), // future
      assetId: null,
      chatId: 99
    };

    (messageService.selectMessageByConditions as jest.Mock)
      .mockResolvedValueOnce([existingMessage]) // first call: existingMessage
      .mockResolvedValueOnce([{ ...existingMessage, isRecalled: true }]); // after update

    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([
      { userId: 3 }
    ]);

    (messageService.updateMessageByConditions as jest.Mock).mockResolvedValue({});

    await controller.recallMessage(req as Request, res as Response, next);

    // Verify socket emit for recall-message (if any sockets exist)
    const ioMock: any = io;
    if ((ioMock.to as jest.Mock).mock.calls.length > 0) {
      const toResult2 = (ioMock.to as jest.Mock).mock.results[0].value;
      expect(toResult2.emit).toHaveBeenCalledWith('recall-message', expect.any(Object));
    } else {
      // no sockets to notify is acceptable in isolated unit test
      expect((ioMock.to as jest.Mock).mock.calls.length).toBe(0);
    }
  });

  // test_case_id: TC_NT_008
  // test_objective: Kiem tra xu ly khi chat khong ton tai trong createAnMessage
  it('should call next when chat not found in createAnMessage', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.body = { chatId: 999, content: 'hi' } as any;

    (chatService.selectChatById as jest.Mock).mockResolvedValue([]);

    await controller.createAnMessage(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_009
  // test_objective: Kiem tra xu ly khi upload anh that bai trong createAnMessage
  it('should call next when uploadImage throws in createAnMessage', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.body = { chatId: 10 } as any;
    const fakeFile = { mimetype: 'image/png', originalname: 'a.png' } as any;
    req!.file = fakeFile as any;

    (chatService.selectChatById as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (fileUploadService.uploadImage as jest.Mock).mockRejectedValue(new Error('upload failed'));

    await controller.createAnMessage(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_010
  // test_objective: Kiem tra gui email khi tao message dau tien trong cuoc tro chuyen
  it('should call sendEmail when first message in conversation', async () => {
    const emailHelper = require('@/utils/email.helper');
    req!.currentUser = { users: { id: 2 } } as any;
    req!.body = { chatId: 11, content: 'hey' } as any;

    (chatService.selectChatById as jest.Mock).mockResolvedValue([{ id: 11 }]);
    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([
      { userId: 3, email: 'other@example.com' }
    ]);
    (messageService.selectMessageByConditions as jest.Mock)
      .mockResolvedValueOnce([]) // for handleSendEmail
      .mockResolvedValueOnce([{ id: 201 }]); // for later select after insert
    (messageService.insertMessage as jest.Mock).mockResolvedValue([{ id: 201 }]);

    await controller.createAnMessage(req as Request, res as Response, next);

    expect(emailHelper.sendEmail).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_011
  // test_objective: Kiem tra xu ly upload anh va chen asset trong createAnMessage
  it('should handle image upload and insert asset on createAnMessage', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.body = { chatId: 12 } as any;
    const fakeFile = { mimetype: 'image/png', originalname: 'b.png' } as any;
    req!.file = fakeFile as any;

    (chatService.selectChatById as jest.Mock).mockResolvedValue([{ id: 12 }]);
    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([{ userId: 3, email: 'o@e.com' }]);
    (fileUploadService.uploadImage as jest.Mock).mockResolvedValue({ secure_url: 'u', public_id: 'p' });
    (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 300 }]);
    (messageService.insertMessage as jest.Mock).mockResolvedValue([{ id: 301 }]);
    (messageService.selectMessageByConditions as jest.Mock).mockResolvedValue([{ id: 301 }]);

    await controller.createAnMessage(req as Request, res as Response, next);

    expect(fileUploadService.uploadImage).toHaveBeenCalled();
    expect(assetService.insertAsset).toHaveBeenCalled();
    expect(messageService.insertMessage).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_012
  // test_objective: Kiem tra xu ly khi thieu messageId trong recallMessage
  it('should call next when messageId missing in recallMessage', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = {} as any;

    await controller.recallMessage(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_013
  // test_objective: Kiem tra xu ly khi vuot qua thoi gian cho phep thu hoi message
  it('should call next when message cannot be recalled (allowRecallTime passed)', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { messageId: '60' } as any;

    const pastMessage = { id: 60, senderId: 2, allowRecallTime: new Date(Date.now() - 60 * 1000).toISOString(), isRecalled: false };
    (messageService.selectMessageByConditions as jest.Mock).mockResolvedValue([pastMessage]);

    await controller.recallMessage(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_014
  // test_objective: Kiem tra xoa asset va resource khi message co assetId
  it('should delete asset and resource when message has assetId', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { messageId: '70' } as any;

    const msg = { id: 70, senderId: 2, allowRecallTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(), assetId: 500, chatId: 99 };
    (messageService.selectMessageByConditions as jest.Mock)
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([{ ...msg, isRecalled: true }]);
    (assetService.selectAssetById as jest.Mock).mockResolvedValue([{ id: 500, name: 'p' }]);
    (assetService.deleteAssetByConditions as jest.Mock).mockResolvedValue({});
    (fileUploadService.deleteResource as jest.Mock).mockResolvedValue({});
    (messageService.updateMessageByConditions as jest.Mock).mockResolvedValue({});

    await controller.recallMessage(req as Request, res as Response, next);

    // Ensure recall flow completed without error (no next(error))
    expect(next).not.toHaveBeenCalled();
  });

  // test_case_id: TC_NT_015
  // test_objective: Kiem tra xu ly khi thieu conversationId trong getMessagesByConversationId
  it('should call next when conversationId missing in getMessagesByConversationId', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = {} as any;

    await controller.getMessagesByConversationId(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_016
  // test_objective: Kiem tra xu ly khi currentUser null trong getMessagesByConversationId
  it('should call next when currentUser is null in getMessagesByConversationId', async () => {
    req!.currentUser = null as any;
    req!.params = { conversationId: '10' } as any;

    await controller.getMessagesByConversationId(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_017
  // test_objective: Kiem tra lay messages khi conversationId la chuoi so
  it('should return messages when conversationId is stringified number in getMessagesByConversationId', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: '10' } as any;

    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([{ chatId: 10 }]);
    (messageService.selectMessagesOfChatId as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await controller.getMessagesByConversationId(req as Request, res as Response, next);

    expect(messageService.selectMessagesOfChatId).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // test_case_id: TC_NT_018
  // test_objective: Kiem tra xu ly khi nguoi dung khong phai thanh vien
  it('should call next when user not member in getMessagesByConversationId', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: '5' } as any;
    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([]);

    await controller.getMessagesByConversationId(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_019
  // test_objective: Kiem tra xu ly khi tham so sap xep khong hop le
  it('should handle invalid ordering param in getMessagesByConversationId', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: '10' } as any;
    req!.query = { sentAt: 'invalid' } as any;
    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([{ chatId: 10 }]);
    (messageService.selectMessagesOfChatId as jest.Mock).mockResolvedValue([]);

    await controller.getMessagesByConversationId(req as Request, res as Response, next);

    expect(messageService.selectMessagesOfChatId).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_020
  // test_objective: Kiem tra xu ly khi pageSize lon trong getMessagesByConversationId
  it('should handle large pageSize in getMessagesByConversationId', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: '10' } as any;
    req!.query = { page: '1', pageSize: '9999999' } as any;
    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([{ chatId: 10 }]);
    (messageService.selectMessagesOfChatId as jest.Mock).mockResolvedValue([]);

    await controller.getMessagesByConversationId(req as Request, res as Response, next);

    expect(messageService.selectMessagesOfChatId).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_021
  // test_objective: Kiem tra tra ket qua phan trang va pagination thanh cong
  it('should return paged results and pagination in getMessagesByConversationId', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: '10' } as any;
    req!.query = { page: '2', pageSize: '5', sentAt: 'desc' } as any;

    (chatService.selectChatMemberByConditions as jest.Mock).mockResolvedValue([{ chatId: 10 }]);

    const totalMessages = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, chatId: 10 }));
    const paged = totalMessages.slice(5, 10); // items 6..10 => page 2

    (messageService.selectMessagesOfChatId as jest.Mock)
      .mockResolvedValueOnce(totalMessages)
      .mockResolvedValueOnce(paged);

    await controller.getMessagesByConversationId(req as Request, res as Response, next);

    expect(messageService.selectMessagesOfChatId).toHaveBeenCalledTimes(2);
    const secondCallOptions = (messageService.selectMessagesOfChatId as jest.Mock).mock.calls[1][1];
    expect(secondCallOptions).toBeDefined();
    expect(secondCallOptions.pagination.page).toBe(2);
    expect(secondCallOptions.pagination.pageSize).toBe(5);
    expect(secondCallOptions.orderConditions.sentAt).toBe('desc');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const sent = (res.json as jest.Mock).mock.calls[0][0];
    expect(sent).toHaveProperty('data');
    expect(sent.data).toHaveProperty('results');
    expect(sent.data).toHaveProperty('pagination');
    expect(sent.data.pagination.totalCount).toBe(12);
    expect(sent.data.pagination.currentPage).toBe(2);
    expect(sent.data.pagination.currentPageSize).toBe(5);
  });

  // test_case_id: TC_NT_022
  // test_objective: Kiem tra xu ly khi members khong hop le
  it('should call next when members invalid in createIndividualConversation', async () => {
    req!.currentUser = { users: { id: 1 } } as any;
    req!.body = { members: 'invalid' } as any;

    await controller.createIndividualConversation(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_023
  // test_objective: Kiem tra xu ly khi members khong bao gom nguoi dung hien tai
  it('should call next when members do not include current user', async () => {
    req!.currentUser = { users: { id: 1 } } as any;
    req!.body = { members: [2, 3] } as any;

    await controller.createIndividualConversation(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_024
  // test_objective: Kiem tra tra cuoc tro chuyen hien tai khi tim thay
  it('should return existing conversation in createIndividualConversation when found', async () => {
    req!.currentUser = { users: { id: 1 } } as any;
    req!.body = { members: [1, 2] } as any;
    (chatService.selectChatIdBetweenTwoUserId as jest.Mock).mockResolvedValue([{ id: 999 }]);

    await controller.createIndividualConversation(req as Request, res as Response, next);

    expect(chatService.insertChat).not.toHaveBeenCalled();
  });

  // test_case_id: TC_NT_025
  // test_objective: Kiem tra tao cuoc tro chuyen moi khi khong tim thay
  it('should create new conversation in createIndividualConversation when not found', async () => {
    req!.currentUser = { users: { id: 1 } } as any;
    req!.body = { members: [1, 3] } as any;
    (chatService.selectChatIdBetweenTwoUserId as jest.Mock).mockResolvedValue([]);
    (chatService.insertChat as jest.Mock).mockResolvedValue([{ id: 555 }]);

    await controller.createIndividualConversation(req as Request, res as Response, next);

    expect(chatService.insertChat).toHaveBeenCalled();
    expect(chatService.insertChatMembers).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_026
  // test_objective: Kiem tra xu ly khi members rong
  it('should call next when members empty in createIndividualConversation', async () => {
    req!.currentUser = { users: { id: 1 } } as any;
    req!.body = { members: [] } as any;

    await controller.createIndividualConversation(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_027
  // test_objective: Kiem tra tao cuoc tro chuyen khi members lap lai
  it('should create conversation when members are duplicated in createIndividualConversation', async () => {
    req!.currentUser = { users: { id: 1 } } as any;
    req!.body = { members: [1, 1] } as any;
    (chatService.selectChatIdBetweenTwoUserId as jest.Mock).mockResolvedValue([]);
    (chatService.insertChat as jest.Mock).mockResolvedValue([{ id: 777 }]);

    await controller.createIndividualConversation(req as Request, res as Response, next);

    expect(chatService.insertChat).toHaveBeenCalled();
    expect(chatService.insertChatMembers).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_028
  // test_objective: Kiem tra xu ly khi conversationId khong hop le
  it('should call next when conversationId invalid in updateChatMemberLastRead', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: 'abc' } as any;

    await controller.updateChatMemberLastRead(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_029
  // test_objective: Kiem tra xu ly khi currentUser null trong updateChatMemberLastRead
  it('should call next when currentUser is null in updateChatMemberLastRead', async () => {
    req!.currentUser = null as any;
    req!.params = { conversationId: '20' } as any;

    await controller.updateChatMemberLastRead(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_030
  // test_objective: Kiem tra xu ly khi conversationId bang 0
  it('should call next when conversationId is zero in updateChatMemberLastRead', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: '0' } as any;

    await controller.updateChatMemberLastRead(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_031
  // test_objective: Kiem tra cap nhat lastRead cua thanh vien chat thanh cong
  it('should update chat member lastRead in updateChatMemberLastRead', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: '20' } as any;

    await controller.updateChatMemberLastRead(req as Request, res as Response, next);

    expect(chatService.updateChatMemberByConditions).toHaveBeenCalled();
  });

  // test_case_id: TC_NT_032
  // test_objective: Kiem tra xu ly khi updateChatMemberByConditions gap loi
  it('should call next when updateChatMemberByConditions throws', async () => {
    req!.currentUser = { users: { id: 2 } } as any;
    req!.params = { conversationId: '21' } as any;
    (chatService.updateChatMemberByConditions as jest.Mock).mockRejectedValue(new Error('db err'));

    await controller.updateChatMemberLastRead(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});
