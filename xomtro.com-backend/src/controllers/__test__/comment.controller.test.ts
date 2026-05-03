import { Request, Response, NextFunction } from 'express';
import { StatusCodes, ReasonPhrases } from 'http-status-codes';

// ─── Mock các service liên quan đến bình luận ─────────────────────────────────

jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn()
}));

jest.mock('@/services/comment.service', () => ({
  insertComment: jest.fn(),
  selectCommentByConditions: jest.fn(),
  updateCommentByCommentId: jest.fn(),
  deleteCommentByConditions: jest.fn(),
  selectPostLevel1Comments: jest.fn(),
  selectDirectChildCommentsFromParentCommentId: jest.fn()
}));

jest.mock('@/services/notification.service', () => ({
  insertNotification: jest.fn(),
  selectNotificationByConditions: jest.fn()
}));

jest.mock('@/configs/socket.config', () => ({
  getSocketIdByUserId: jest.fn(),
  io: {
    to: jest.fn().mockReturnValue({ emit: jest.fn() })
  }
}));

jest.mock('@/utils/ApiError.helper', () => {
  return jest.fn().mockImplementation((statusCode: number, message: string) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    return error;
  });
});

jest.mock('@/utils/ApiResponse.helper', () => ({
  ApiResponse: jest.fn().mockImplementation((statusCode: number, message: string, data?: any) => ({
    statusCode,
    message,
    data,
    send: jest.fn().mockReturnValue({ statusCode, message, data })
  }))
}));

jest.mock('@/utils/schema.helper', () => ({
  paginationHelper: jest.fn().mockReturnValue({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0
  })
}));

// ─── Import sau khi mock ──────────────────────────────────────────────────────

import {
  createComment,
  updateComment,
  removeComment,
  getPostComments
} from '@/controllers/post.controller';

import * as postService from '@/services/post.service';
import * as commentService from '@/services/comment.service';
import * as notificationService from '@/services/notification.service';
import * as socketConfig from '@/configs/socket.config';
import { ApiResponse } from '@/utils/ApiResponse.helper';

// ─── Dữ liệu dùng chung ──────────────────────────────────────────────────────

/**
 * Post giả tồn tại trong DB
 * ownerId = 99 → chủ bài viết, khác với currentUser (id = 1)
 */
const mockPost = {
  id: 10,
  ownerId: 99,
  type: 'rental',
  title: 'Phòng trọ Q1',
  status: 'actived'
};

/**
 * Comment giả tồn tại trong DB
 * ownerId = 1 → khớp với currentUser mặc định
 */
const mockComment = {
  id: 55,
  postId: 10,
  ownerId: 1,
  content: 'Bình luận gốc',
  tags: '',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01')
};

/** Notification giả */
const mockNotification = {
  id: 7,
  postId: 10,
  userId: 99,
  type: 'post',
  title: 'Một bình luận mới trong bài viết của bạn',
  content: 'Test User đã bình luận vào bài viết của bạn.'
};

// ─── Helper tạo mock req / res / next ────────────────────────────────────────

/**
 * Tạo mock Request với currentUser mặc định (userId = 1)
 * Override bất kỳ field nào qua tham số
 */
const makeReq = (overrides: Partial<Request> = {}): Partial<Request> => ({
  body: {},
  params: {},
  currentUser: {
    users: { id: 1, email: 'user@test.com' } as any,
    users_detail: {
      userId: 1,
      role: 'user',
      firstName: 'Test',
      lastName: 'User'
    } as any
  },
  ...overrides
});
const makeRes = (): Partial<Response> => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
});

const next: NextFunction = jest.fn();

// ─── Reset mock trước mỗi test ───────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Post tồn tại
  (postService.selectPostById as jest.Mock).mockResolvedValue([mockPost]);

  // Comment service - happy path defaults
  (commentService.insertComment as jest.Mock)
    .mockResolvedValue([[[ { id: 55 } ]]]);
  (commentService.selectCommentByConditions as jest.Mock)
    .mockResolvedValue([mockComment]);
  (commentService.updateCommentByCommentId as jest.Mock)
    .mockResolvedValue([{}]);
  (commentService.deleteCommentByConditions as jest.Mock)
    .mockResolvedValue([{}]);
  (commentService.selectPostLevel1Comments as jest.Mock)
    .mockResolvedValue([mockComment]);
  (commentService.selectDirectChildCommentsFromParentCommentId as jest.Mock)
    .mockResolvedValue([mockComment]);
  // Notification service
  (notificationService.insertNotification as jest.Mock)
    .mockResolvedValue([{ id: 7 }]);
  (notificationService.selectNotificationByConditions as jest.Mock)
    .mockResolvedValue([mockNotification]);

  // Socket - mặc định owner offline
  (socketConfig.getSocketIdByUserId as jest.Mock).mockReturnValue(null);
  (socketConfig.io.to as jest.Mock).mockReturnValue({ emit: jest.fn() });
});


describe('createComment', () => {

  // ── Happy path → HTTP 201 CREATED ───────────────────────────────────────────

  it('TCQLBL01: Tạo comment thành công với đủ thông tin', async () => {
    const req = makeReq({
      body: { postId: 10, content: 'Bình luận hay!', tags: 'tag1' }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    expect(commentService.insertComment).toHaveBeenCalledTimes(1);
    expect(commentService.selectCommentByConditions).toHaveBeenCalledTimes(1);
    // ✅ HTTP 201
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.CREATED,                   // 201
      'Create a comment successfully!',
      [mockComment]
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TCQLBL02: content = "" (rỗng) ', async () => {
    // Controller: content ? content : '' → "" là falsy → set = ''
    // Cho phép comment không có nội dung (chỉ tags hoặc reply không chữ)
    const req = makeReq({
      body: { postId: 10, content: '' }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    // expect(commentService.insertComment).toHaveBeenCalledWith(
    //   expect.objectContaining({ content: '' })
    // );
    expect(commentService.insertComment).not.toHaveBeenCalled();
    //  HTTP 201: content rỗng được chấp nhận — không có validation required
    // expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.BAD_REQUEST, 
      'Content cannot be empty!', // Hoặc message lỗi mà bạn mong muốn
      expect.anything()
    );
  });

  it('TCQLBL03: content = undefined', async () => {
    // undefined là falsy → content = ''
    const req = makeReq({
      body: { postId: 10 } // không truyền content
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    // expect(commentService.insertComment).toHaveBeenCalledWith(
    //   expect.objectContaining({ content: '' })
    // );
    // //  HTTP 201
    // expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
    // 2. Kiểm tra: Không được phép gọi xuống Service để lưu vào DB
    // Vì content bị thiếu, hệ thống đúng ra phải dừng lại ngay lập tức
    expect(commentService.insertComment).not.toHaveBeenCalled();

    // 3. Kiểm tra: Trả về lỗi 400 (Bad Request)
    // Nếu thực tế Backend trả về 201, dòng này sẽ báo FAIL đỏ lòm để bạn bắt lỗi
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.BAD_REQUEST, 
      'Content is required!', 
      expect.anything()
    );
  });

  it('TCQLBL04: content = null', async () => {
    const req = makeReq({
      body: { postId: 10, content: null }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    // expect(commentService.insertComment).toHaveBeenCalledWith(
    //   expect.objectContaining({ content: '' })
    // );
    // // HTTP 201
    // expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
    expect(commentService.insertComment).not.toHaveBeenCalled();
  expect(ApiResponse).toHaveBeenCalledWith(
    StatusCodes.BAD_REQUEST, 
    expect.anything(), 
    expect.anything()
  );
  });

  it('TCQLBL05: tags = undefined → KHÔNG thêm field tags vào payload', async () => {
    // ...(tags && { tags }) → tags falsy → không spread → field tags không có trong payload
    const req = makeReq({
      body: { postId: 10, content: 'Hello' } 
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    expect(commentService.insertComment).toHaveBeenCalledWith(
      expect.not.objectContaining({ tags: expect.anything() })
    );
    // HTTP 201
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
  });

  it('TCQLBL06: tags có giá trị → được thêm vào payload, HTTP 201', async () => {
    // ...(tags && { tags }) → tags truthy → spread vào payload
    const req = makeReq({
      body: { postId: 10, content: 'Hi', tags: 'mention:user3,user4' }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    expect(commentService.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ tags: 'mention:user3,user4' })
    );
    //  HTTP 201
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
  });

  it('TCQLBL07: parentCommentId hợp lệ → được thêm vào payload , HTTP 201', async () => {
    // ...(parentCommentId && { parentCommentId: Number(parentCommentId) })
    const req = makeReq({
      body: { postId: 10, content: 'Reply!', parentCommentId: 33 }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    expect(commentService.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ parentCommentId: 33 })
    );
    //  HTTP 201
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
  });

  it('TCQLBL08: parentCommentId = 0 (falsy) → KHÔNG thêm vào payload → comment leveL1', async () => {
    // 0 là falsy → ...(0 && {...}) = false → không spread parentCommentId
    //  NOTE: truyền parentCommentId = 0 bị bỏ qua hoàn toàn
    const req = makeReq({
      body: { postId: 10, content: 'Level 1', parentCommentId: 0 }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    expect(commentService.insertComment).toHaveBeenCalledWith(
      expect.not.objectContaining({ parentCommentId: expect.anything() })
    );
    //  HTTP 201
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
  });

  it('TCQLBL09: content rất dài (10,000 ký tự) → không có validation length, insert bình thường', async () => {
    // Controller không giới hạn độ dài content → pass thẳng vào DB
    //  Không có HTTP code lỗi
    const longContent = 'a'.repeat(10000);
    const req = makeReq({
      body: { postId: 10, content: longContent }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    expect(commentService.insertComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: longContent })
    );
  });


  it('TCQLBL10: currentUser khác postOwner + owner có socketId → emit "new-notification"', async () => {
    // users.id = 1 ≠ ownerId = 99 → khác nhau
    // getSocketIdByUserId(99) = 'socket-abc' → cả 2 điều kiện thỏa → emit
    const mockEmit = jest.fn();
    (socketConfig.getSocketIdByUserId as jest.Mock).mockReturnValue('socket-abc');
    (socketConfig.io.to as jest.Mock).mockReturnValue({ emit: mockEmit });

    const req = makeReq({ body: { postId: 10, content: 'Comment!' } });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    //  Emit được gọi đúng event và đúng data
    expect(socketConfig.io.to).toHaveBeenCalledWith('socket-abc');
    expect(mockEmit).toHaveBeenCalledWith('new-notification', mockNotification);
    //  HTTP 201 vẫn trả về dù emit hay không
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
  });

  it('TCQLBL11: currentUser === postOwner → KHÔNG emit (tự comment bài của mình)', async () => {
    // users.id = 99 = ownerId → điều kiện users.id !== ownerId = false → skip emit
    const req = makeReq({
      body: { postId: 10, content: 'Chủ nhà tự reply!' },
      currentUser: {
        users: { id: 99 } as any,           // trùng ownerId = 99
        users_detail: {
          userId: 99,
          role: 'landlord',
          firstName: 'Owner',
          lastName: 'User'
        } as any
      }
    });
    const res = makeRes();
    (socketConfig.getSocketIdByUserId as jest.Mock).mockReturnValue('socket-owner');

    await createComment(req as Request, res as Response, next);

    //  Không emit vì tự comment bài của mình
    expect(socketConfig.io.to).not.toHaveBeenCalled();
    //  HTTP 201 vẫn trả về
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
  });

  it('TCQLBL12: owner offline (socketId = null) → KHÔNG emit, vẫn HTTP 201', async () => {
    // getSocketIdByUserId → null → if(null && ...) = false → skip emit
    (socketConfig.getSocketIdByUserId as jest.Mock).mockReturnValue(null);

    const req = makeReq({ body: { postId: 10, content: 'Comment!' } });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    //  Không emit vì owner không có socket
    expect(socketConfig.io.to).not.toHaveBeenCalled();
    //  HTTP 201: emit chỉ là side-effect, không block response
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, 'Create a comment successfully!', [mockComment]);
  });

  // ── postId không hợp lệ → HTTP 400 BAD REQUEST ──────────────────────────────
  // Controller: selectPostById → nếu trả [] → throw ApiError(400)
  // Không validate postId trước khi gọi DB (khác với updateComment / removeComment)

  it('TCQLBL13: postId không tồn tại trong DB → HTTP 400 BAD REQUEST', async () => {
    // selectPostById trả [] → !existingPost.length = true → throw ApiError(400)
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);

    const req = makeReq({ body: { postId: 9999, content: 'Comment!' } });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    //  HTTP 400
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }) // 400
    );
    expect(commentService.insertComment).not.toHaveBeenCalled();
  });

  it('TCQLBL14: postId = undefined → Number(undefined) = NaN → DB trả [] → HTTP 400', async () => {
    // Controller không validate postId → gọi selectPostById(NaN) luôn
    // Giả sử DB trả [] với NaN → throw 400
    //  NOTE: nên validate postId là số nguyên trước khi gọi DB
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);

    const req = makeReq({ body: { content: 'No postId!' } }); // thiếu postId
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    //  HTTP 400
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
  });

  it('TCQLBL15: postId = "abc" → Number("abc") = NaN → DB trả [] → HTTP 400', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);

    const req = makeReq({ body: { postId: 'abc', content: 'Comment!' } });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    //  HTTP 400
    //  NOTE: nên validate postId là số nguyên trước khi gọi DB
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
  });

  // ── DB / service lỗi → next(error), HTTP 500 do errorHandler ────────────────
  //  HTTP code không assert được — controller chỉ gọi next(error)

  it('TCQLBL16: insertComment throw lỗi DB → next(error) ', async () => {
    const err = new Error('Comment insert failed');
    (commentService.insertComment as jest.Mock).mockRejectedValue(err);

    const req = makeReq({ body: { postId: 10, content: 'Comment!' } });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(err);
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
  });

  it('TCQLBL17: insertNotification throw lỗi → next(error) ', async () => {
    // insertNotification chạy sau insertComment — lỗi vẫn bị catch → next
    const err = new Error('Notification DB error');
    (notificationService.insertNotification as jest.Mock).mockRejectedValue(err);

    const req = makeReq({ body: { postId: 10, content: 'Comment!' } });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(err);
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
  });
  it('TCQLBL18: tags (post đính kèm) không thuộc sở hữu của người bình luận → PHẢI trả về HTTP 400', async () => {
    // Giả sử currentUser ID là 1, nhưng bài viết đính kèm (tags) là ID bài của user khác
    const req = makeReq({
      currentUser: {
        users: { id: 1 }, 
        users_detail: { userId: 1, firstName: 'A', lastName: 'Nguyễn' }
      } as any,
      body: { 
        postId: 10, 
        content: 'Bình luận và đính kèm bài viết của người khác!', 
        tags: 'post:99' // Giả sử post 99 là của user 2
      }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    // MONG ĐỢI: Backend phải check sở hữu và chặn lại (Không gọi hàm insert)
    expect(commentService.insertComment).not.toHaveBeenCalled();
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.BAD_REQUEST, 
      expect.stringMatching(/owner|permission/i), 
      expect.anything()
    );
  });
  it('TCQLBL19: tags (post đính kèm) trỏ tới Post ID không tồn tại → PHẢI trả về HTTP 400', async () => {
    const req = makeReq({
      body: { 
        postId: 10, 
        content: 'Đính kèm một bài viết không tồn tại', 
        tags: 'post:999999' 
      }
    });
    const res = makeRes();

    await createComment(req as Request, res as Response, next);

    // MONG ĐỢI: Phải kiểm tra sự tồn tại của post trong tags trước khi lưu
    expect(commentService.insertComment).not.toHaveBeenCalled();
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.BAD_REQUEST, 
      'Tagged post does not exist!', 
      expect.anything()
    );
  });
});


describe('updateComment', () => {

  it('TCQLBL20: Cập nhật comment thành công → HTTP 200 OK', async () => {
    const req = makeReq({
      params: { commentId: '55' },
      body: { content: 'Nội dung mới', tags: 'tag1' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    expect(commentService.updateCommentByCommentId).toHaveBeenCalledTimes(1);
    //  HTTP 200
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.OK,                        // 200
      'Update comment successfully!',
      mockComment
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TCQLBL21: updateCommentByCommentId được gọi với đúng id (Number, không phải string)', async () => {
    // Kiểm tra commentId được convert sang Number trước khi gọi select
    const req = makeReq({
      params: { commentId: '55' },
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    // selectCommentByConditions nhận Number(55), không phải string '55'
    expect(commentService.selectCommentByConditions).toHaveBeenCalledWith({
      id: { operator: 'eq', value: 55 },     // số, không phải '55'
      ownerId: { operator: 'eq', value: 1 }  // users.id của currentUser
    });
    //  HTTP 200
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.OK, 'Update comment successfully!', mockComment);
  });

  it('TCQLBL22: tags = undefined → tags được set = "" trong payload', async () => {
    // tags ? tags : '' → tags undefined → ''
    const req = makeReq({
      params: { commentId: '55' },
      body: { content: 'Update nội dung' } 
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    expect(commentService.updateCommentByCommentId).toHaveBeenCalledWith(
      55,
      expect.objectContaining({ tags: '' })
    );
    //  HTTP 200
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.OK, 'Update comment successfully!', mockComment);
  });

  it('TCQLBL23: tags có giá trị → được giữ nguyên trong payload', async () => {
    const req = makeReq({
      params: { commentId: '55' },
      body: { content: 'Update', tags: 'mention:user5' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    expect(commentService.updateCommentByCommentId).toHaveBeenCalledWith(
      55,
      expect.objectContaining({ tags: 'mention:user5', content: 'Update' })
    );
    //  HTTP 200
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.OK, 'Update comment successfully!', mockComment);
  });

  // ── commentId không hợp lệ → HTTP 400 BAD REQUEST ───────────────────────────
  // Controller: if (!commentId || !Number.isSafeInteger(Number(commentId))) → throw 400

  it('TCQLBL24: commentId = undefined → !commentId = true → HTTP 400', async () => {
    const req = makeReq({
      params: {},                            // không có commentId
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  HTTP 400: commentId bắt buộc phải có
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }) // 400
    );
    // Không gọi DB khi validate fail
    expect(commentService.selectCommentByConditions).not.toHaveBeenCalled();
    expect(commentService.updateCommentByCommentId).not.toHaveBeenCalled();
  });

  it('TCQLBL25: commentId = "abc" → Number("abc") = NaN → isSafeInteger(NaN) = false → HTTP 400', async () => {
    const req = makeReq({
      params: { commentId: 'abc' },
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  HTTP 400: commentId phải là số nguyên an toàn
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
    expect(commentService.updateCommentByCommentId).not.toHaveBeenCalled();
  });

  it('TCQLBL26: commentId = "1.5" → Number("1.5") = 1.5 → isSafeInteger(1.5) = false → HTTP 400', async () => {
    // Float không phải safe integer
    const req = makeReq({
      params: { commentId: '1.5' },
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  HTTP 400
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
  });

  it('TCQLBL27: commentId = "-5" → isSafeInteger(-5) = true → pass validate → DB trả [] → HTTP 404', async () => {
    // -5 là safe integer → vượt qua validate → gọi DB
    // DB không có comment với id âm → [] → throw 404
    //  NOTE: nên thêm validate commentId > 0 để tránh gọi DB vô ích
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([]);

    const req = makeReq({
      params: { commentId: '-5' },
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  HTTP 404: id âm pass validate nhưng không có trong DB
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }) // 404
    );
    expect(commentService.updateCommentByCommentId).not.toHaveBeenCalled();
  });

  it('TCQLBL28: commentId = "0" → isSafeInteger(0) = true → DB trả [] → HTTP 404', async () => {
    // 0 là safe integer → vượt validate → DB không tìm thấy → 404
    //  NOTE: commentId = 0 vô nghĩa, nên validate > 0
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([]);

    const req = makeReq({
      params: { commentId: '0' },
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  HTTP 404
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
    );
  });

  // ── Comment không tồn tại / sai owner → HTTP 404 NOT FOUND ──────────────────
  // Query: WHERE id = commentId AND ownerId = users.id
  //  Không tìm thấy hoặc sai owner đều trả [] → cùng throw 404
  // Không dùng 403 để ẩn thông tin (security by obscurity)

  it('TCQLBL29: comment không tồn tại trong DB → HTTP 404 NOT FOUND', async () => {
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([]);

    const req = makeReq({
      params: { commentId: '9999' },
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  HTTP 404
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }) // 404
    );
    expect(commentService.updateCommentByCommentId).not.toHaveBeenCalled();
  });

  it('TCQLBL30: comment tồn tại nhưng sai owner → HTTP 404 (không phải 403)', async () => {
    // SELECT WHERE id = 55 AND ownerId = 888 → comment của user 1, không phải 888 → []
    // Controller dùng 404 thay 403 → không lộ comment có tồn tại hay không
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([]);

    const req = makeReq({
      params: { commentId: '55' },
      body: { content: 'Xâm phạm comment người khác' },
      currentUser: {
        users: { id: 888 } as any,          // khác ownerId = 1
        users_detail: { userId: 888, role: 'user' } as any
      }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    // HTTP 404: security by obscurity — không để lộ resource tồn tại
    //Design note: 404 thay vì 403 là intentional
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
    );
    expect(commentService.updateCommentByCommentId).not.toHaveBeenCalled();
  });


  it('TCQLBL31: updateCommentByCommentId throw lỗi DB → next(error) [HTTP 500]', async () => {
    const err = new Error('Update DB failed');
    (commentService.updateCommentByCommentId as jest.Mock).mockRejectedValue(err);

    const req = makeReq({
      params: { commentId: '55' },
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(err);
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.OK, expect.anything(), expect.anything());
  });

  it('TCQLBL32: selectComment lần 2 (sau update) throw lỗi → next(error) [HTTP 500]', async () => {
    // selectComment được gọi 2 lần:
    //   Lần 1: verify owner → mockResolvedValueOnce thành công
    //   Lần 2: lấy data mới sau update → mockRejectedValueOnce lỗi
    (commentService.selectCommentByConditions as jest.Mock)
      .mockResolvedValueOnce([mockComment])         // lần 1: verify owner OK
      .mockRejectedValueOnce(new Error('Select failed')); // lần 2: lỗi

    const req = makeReq({
      params: { commentId: '55' },
      body: { content: 'Update' }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.OK, expect.anything(), expect.anything());
  });

  it('TCQLBL33: Chặn cập nhật tags (post đính kèm) không thuộc sở hữu của mình → PHẢI trả về 400', async () => {
    // Mock: Comment gốc (ID 55) thuộc về User 1
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([mockComment]);
    // Mock: Post đính kèm (ID 99) trong tags thuộc về User 2
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 99, ownerId: 2 }]);

    const req = makeReq({
      params: { commentId: '55' },
      body: { 
        content: 'Cố tình đính kèm bài của người khác', 
        tags: 'post:99' 
      }
      // currentUser mặc định là id: 1 qua makeReq
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    // MONG ĐỢI: Phải chặn lại (400) vì User 1 không sở hữu Post 99
    expect(commentService.updateCommentByCommentId).not.toHaveBeenCalled();
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.BAD_REQUEST, 
      expect.stringMatching(/owner|permission/i), 
      expect.anything()
    );
  });

  it('TCQLBL34: Chặn cập nhật nội dung bình luận thành rỗng → PHẢI trả về 400', async () => {
    // Mock: Comment gốc thuộc về User 1
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([mockComment]);

    const req = makeReq({
      params: { commentId: '55' },
      body: { content: '' } // Xóa sạch nội dung
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    // MONG ĐỢI: Chặn 400, không cho phép comment không có chữ
    expect(commentService.updateCommentByCommentId).not.toHaveBeenCalled();
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.BAD_REQUEST, 
      'Content cannot be empty!', 
      expect.anything()
    );
  });

  it('TCQLBL35: Hệ thống phải phớt lờ việc cập nhật postId (postId là bất biến)', async () => {
    // Mock: Comment gốc thuộc về User 1
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([mockComment]);

    const req = makeReq({
      params: { commentId: '55' },
      body: { 
        postId: 200, // Cố tình gửi postId để "hack"
        content: 'Nội dung mới' 
      }
    });
    const res = makeRes();

    await updateComment(req as Request, res as Response, next);

    //  Test này sẽ PASS nếu Backend lọc bỏ postId
    expect(commentService.updateCommentByCommentId).toHaveBeenCalledWith(
      55, 
      expect.not.objectContaining({ postId: 200 }) 
    );
    
    // Vẫn trả về 200 vì content vẫn được cập nhật thành công
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.OK, expect.anything(), expect.anything());
}); 

});

describe('removeComment', () => {

  // ── Happy path → HTTP 200 OK ─────────────────────────────────────────────────

  it('TCQLBL36: Xóa comment thành công → HTTP 200 OK', async () => {
    const req = makeReq({ params: { commentId: '55' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    expect(commentService.deleteCommentByConditions).toHaveBeenCalledTimes(1);
    //  HTTP 200
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.OK,                        // 200
      'Delete comment successfully!',
      { id: 55 }
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TCQLBL37: deleteCommentByConditions được gọi với đúng id VÀ ownerId', async () => {
    // DELETE phải có cả id lẫn ownerId để tránh xóa comment của người khác
    const req = makeReq({ params: { commentId: '55' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    expect(commentService.deleteCommentByConditions).toHaveBeenCalledWith({
      id: { operator: 'eq', value: 55 },     // id comment cần xóa
      ownerId: { operator: 'eq', value: 1 }  // users.id hiện tại — double check owner
    });
    //  HTTP 200
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.OK, 'Delete comment successfully!', { id: 55 });
  });


  it('TCQLBL38: commentId = undefined → !commentId = true → HTTP 400', async () => {
    const req = makeReq({ params: {} }); // không có commentId
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    //  HTTP 400: commentId bắt buộc
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }) // 400
    );
    expect(commentService.selectCommentByConditions).not.toHaveBeenCalled();
    expect(commentService.deleteCommentByConditions).not.toHaveBeenCalled();
  });

  it('TCQLBL39: commentId = "abc" → NaN → isSafeInteger(NaN) = false → HTTP 400', async () => {
    const req = makeReq({ params: { commentId: 'abc' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    //  HTTP 400
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
    expect(commentService.deleteCommentByConditions).not.toHaveBeenCalled();
  });

  it('TCQLBL40: commentId = "1.7" → isSafeInteger(1.7) = false → HTTP 400', async () => {
    const req = makeReq({ params: { commentId: '1.7' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    //  HTTP 400
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
  });

  it('TCQLBL41: commentId = "-5" → isSafeInteger(-5) = true → DB trả [] → HTTP 404', async () => {
    // -5 pass validate → gọi selectComment(-5) → DB trả [] → throw 404
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([]);

    const req = makeReq({ params: { commentId: '-5' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    //  HTTP 404: id âm pass validate nhưng không có trong DB
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }) // 404
    );
    expect(commentService.deleteCommentByConditions).not.toHaveBeenCalled();
  });

  it('TCQLBL42: commentId = "0" → isSafeInteger(0) = true → DB trả [] → HTTP 404', async () => {
    
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([]);

    const req = makeReq({ params: { commentId: '0' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    //  HTTP 404
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
    );
  });


  it('TCQLBL43: comment không tồn tại → HTTP 404 NOT FOUND', async () => {
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([]);

    const req = makeReq({ params: { commentId: '9999' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    //  HTTP 404
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }) // 404
    );
    expect(commentService.deleteCommentByConditions).not.toHaveBeenCalled();
  });

  it('TCQLBL44: comment tồn tại nhưng sai owner → HTTP 404 (không phải 403)', async () => {
    // WHERE id = 55 AND ownerId = 888 → không khớp → [] → throw 404
    (commentService.selectCommentByConditions as jest.Mock).mockResolvedValue([]);

    const req = makeReq({
      params: { commentId: '55' },
      currentUser: {
        users: { id: 888 } as any,
        users_detail: { userId: 888, role: 'user' } as any
      }
    });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
    );
    expect(commentService.deleteCommentByConditions).not.toHaveBeenCalled();
  });

  it('TCQLBL45: deleteCommentByConditions throw lỗi DB → next(error) [HTTP 500]', async () => {
    const err = new Error('Delete DB failed');
    (commentService.deleteCommentByConditions as jest.Mock).mockRejectedValue(err);

    const req = makeReq({ params: { commentId: '55' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(err);
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.OK, expect.anything(), expect.anything());
  });

  it('TCQLBL46: selectCommentByConditions throw lỗi DB → next(error) [HTTP 500]', async () => {
    // selectComment (verify owner) lỗi → catch → next
    const err = new Error('Select DB failed');
    (commentService.selectCommentByConditions as jest.Mock).mockRejectedValue(err);

    const req = makeReq({ params: { commentId: '55' } });
    const res = makeRes();

    await removeComment(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(err);
    expect(commentService.deleteCommentByConditions).not.toHaveBeenCalled();
  });
});


describe('getPostComments', () => {


  it('TCQLBL47: Không có parentCommentId → lấy leveL1 comments → HTTP 200', async () => {
    // !parentCommentId = true → vào nhánh selectPostLevel1Comments
    // Gọi 2 lần: lần 1 pageSize=999999 để count total, lần 2 với pagination thực
    const req = makeReq({
      params: { postId: '10' },
      body: {
        whereConditions: {},               // không có parentCommentId
        orderConditions: { updatedAt: 'desc' },
        pagination: { page: 1, pageSize: 10 }
      }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    // selectPostLevel1Comments gọi 2 lần (total + paginated result)
    expect(commentService.selectPostLevel1Comments).toHaveBeenCalledTimes(2);
    expect(commentService.selectDirectChildCommentsFromParentCommentId).not.toHaveBeenCalled();
    //  HTTP 200
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.OK,                      // 200
      ReasonPhrases.OK,
      expect.objectContaining({
        results: [mockComment],
        pagination: expect.any(Object)
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TCQLBL48: Có parentCommentId hợp lệ → lấy child comments → HTTP 200', async () => {
    // parentCommentId = 33 → truthy → vào nhánh selectDirectChildComments
    const mockChildren = [{ ...mockComment, parentCommentId: 33 }];
    (commentService.selectDirectChildCommentsFromParentCommentId as jest.Mock)
      .mockResolvedValue(mockChildren);

    const req = makeReq({
      params: { postId: '10' },
      body: {
        whereConditions: { parentCommentId: 33 },
        orderConditions: {},
        pagination: { page: 1, pageSize: 5 }
      }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    // selectDirectChildComments gọi 2 lần (total + paginated result)
    expect(commentService.selectDirectChildCommentsFromParentCommentId).toHaveBeenCalledTimes(2);
    expect(commentService.selectPostLevel1Comments).not.toHaveBeenCalled();
    // HTTP 200
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.OK,
      ReasonPhrases.OK,
      expect.objectContaining({ results: mockChildren })
    );
  });

  it('TCQLBL49: Không có pagination → vẫn hoạt động, HTTP 200', async () => {
    // pagination undefined → options không có pagination → DB tự lấy tất cả
    const req = makeReq({
      params: { postId: '10' },
      body: {
        whereConditions: {},
        orderConditions: {}
        // không có pagination
      }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 200: pagination optional
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.OK, ReasonPhrases.OK, expect.any(Object));
  });

  it('TCQLBL50: whereConditions và orderConditions đều là {} → hợp lệ, HTTP 200', async () => {
    // {} là truthy → !{} = false → không throw → đây là case bình thường
    const req = makeReq({
      params: { postId: '10' },
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 200: {} khác undefined, controller chấp nhận object rỗng
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.OK, ReasonPhrases.OK, expect.any(Object));
  });

  // ── postId không hợp lệ → HTTP 400 BAD REQUEST ──────────────────────────────
  // Controller: if (!postId || !Number.isSafeInteger(Number(postId))) → throw 400

  it('TCQLBL51: postId = undefined → !postId = true → HTTP 400', async () => {
    const req = makeReq({
      params: {},                          // không có postId
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 400: postId bắt buộc phải có
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }) // 400
    );
    expect(postService.selectPostById).not.toHaveBeenCalled();
  });

  it('TCQLBL52: postId = "abc" → NaN → isSafeInteger(NaN) = false → HTTP 400', async () => {
    const req = makeReq({
      params: { postId: 'abc' },
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 400
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
    expect(postService.selectPostById).not.toHaveBeenCalled();
  });

  it('TCQLBL53: postId = "1.5" → isSafeInteger(1.5) = false → HTTP 400', async () => {
    const req = makeReq({
      params: { postId: '1.5' },
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 400
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
  });

  it('TCQLBL54: postId âm "-1" → isSafeInteger(-1) = true → gọi DB → trả [] → HTTP 404', async () => {
    // -1 pass validate → selectPostById(-1) → DB trả [] → throw 404
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);

    const req = makeReq({
      params: { postId: '-1' },
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 404: id âm pass validate nhưng không có post trong DB
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }) // 404
    );
    expect(commentService.selectPostLevel1Comments).not.toHaveBeenCalled();
  });

  it('TCQLBL55: postId = "0" → isSafeInteger(0) = true → gọi DB → trả [] → HTTP 404', async () => {
    //  NOTE: postId = 0 vô nghĩa nhưng pass validate
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);

    const req = makeReq({
      params: { postId: '0' },
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 404
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
    );
  });


  it('TCQLBL56: whereConditions = undefined → HTTP 422 UNPROCESSABLE ENTITY', async () => {
    const req = makeReq({
      params: { postId: '10' },
      body: { orderConditions: {} }         // thiếu whereConditions
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 422: whereConditions bắt buộc (dù có thể là {} rỗng)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.UNPROCESSABLE_ENTITY }) // 422
    );
    // Không gọi DB khi thiếu params bắt buộc
    expect(postService.selectPostById).not.toHaveBeenCalled();
  });

  it('TCQLBL57: orderConditions = undefined → HTTP 422', async () => {
    const req = makeReq({
      params: { postId: '10' },
      body: { whereConditions: {} }         // thiếu orderConditions
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 422
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.UNPROCESSABLE_ENTITY })
    );
    expect(postService.selectPostById).not.toHaveBeenCalled();
  });


  it('TCQLBL58: post không tồn tại trong DB → HTTP 404 NOT FOUND', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);

    const req = makeReq({
      params: { postId: '9999' },
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 404
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }) // 404
    );
    expect(commentService.selectPostLevel1Comments).not.toHaveBeenCalled();
  });


  it('TCQLBL59: parentCommentId = "abc" → isSafeInteger(NaN) = false → HTTP 400', async () => {
    const req = makeReq({
      params: { postId: '10' },
      body: {
        whereConditions: { parentCommentId: 'abc' },
        orderConditions: {}
      }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 400: parentCommentId phải là safe integer khi được truyền
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }) // 400
    );
    expect(commentService.selectDirectChildCommentsFromParentCommentId).not.toHaveBeenCalled();
  });

  it('TCQLBL60: parentCommentId = "1.5" → isSafeInteger(1.5) = false → HTTP 400', async () => {
    const req = makeReq({
      params: { postId: '10' },
      body: {
        whereConditions: { parentCommentId: '1.5' },
        orderConditions: {}
      }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 400
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
    );
  });

  it('TCQLBL61: parentCommentId = 0 → falsy → bỏ qua validate → lấy leveL1 comments', async () => {
    const req = makeReq({
      params: { postId: '10' },
      body: {
        whereConditions: { parentCommentId: 0 },
        orderConditions: {}
      }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 200: lấy leveL1 (parentCommentId 0 bị coi như không có)
    expect(commentService.selectPostLevel1Comments).toHaveBeenCalledTimes(2);
    expect(commentService.selectDirectChildCommentsFromParentCommentId).not.toHaveBeenCalled();
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.OK, ReasonPhrases.OK, expect.any(Object));
  });

  it('TCQLBL62: parentCommentId âm (-3) → isSafeInteger(-3) = true → lấy child với id âm → trả rỗng', async () => {
    (commentService.selectDirectChildCommentsFromParentCommentId as jest.Mock)
      .mockResolvedValue([]);

    const req = makeReq({
      params: { postId: '10' },
      body: {
        whereConditions: { parentCommentId: -3 },
        orderConditions: {}
      }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP 200: gọi với id âm, DB trả rỗng, không throw
    expect(commentService.selectDirectChildCommentsFromParentCommentId).toHaveBeenCalledTimes(2);
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.OK,
      ReasonPhrases.OK,
      expect.objectContaining({ results: [] })
    );
  });


  it('TCQLBL63: selectPostLevel1Comments throw lỗi → next(error) [HTTP 500]', async () => {
    const err = new Error('Select level1 failed');
    (commentService.selectPostLevel1Comments as jest.Mock).mockRejectedValue(err);

    const req = makeReq({
      params: { postId: '10' },
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(err);
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.OK, expect.anything(), expect.anything());
  });

  it('TCQLBL64: selectDirectChildComments throw lỗi → next(error) [HTTP 500]', async () => {
    const err = new Error('Select child failed');
    (commentService.selectDirectChildCommentsFromParentCommentId as jest.Mock)
      .mockRejectedValue(err);

    const req = makeReq({
      params: { postId: '10' },
      body: {
        whereConditions: { parentCommentId: 33 },
        orderConditions: {}
      }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(err);
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.OK, expect.anything(), expect.anything());
  });

  it('TCQLBL65: selectPostById throw lỗi DB → next(error) [HTTP 500]', async () => {
    const err = new Error('Post select failed');
    (postService.selectPostById as jest.Mock).mockRejectedValue(err);

    const req = makeReq({
      params: { postId: '10' },
      body: { whereConditions: {}, orderConditions: {} }
    });
    const res = makeRes();

    await getPostComments(req as Request, res as Response, next);

    //  HTTP code không assert được
    expect(next).toHaveBeenCalledWith(err);
  });
  it('TCQLBL66: Thêm vào điều kiện updatedAt = "desc" → được forward vào options.orderConditions', async () => {
  const req = makeReq({
    params: { postId: '10' },
    body: { whereConditions: {}, orderConditions: { updatedAt: 'desc' } }
  });
  const res = makeRes();
  await getPostComments(req as Request, res as Response, next);

  expect(commentService.selectPostLevel1Comments).toHaveBeenCalledWith(10,
    expect.objectContaining({
      orderConditions: { updatedAt: 'desc' }
    })
  );
});

it('TCQLBL67: Để updatedAt = undefined → orderConditions truyền xuống là {}', async () => {
  const req = makeReq({
    params: { postId: '10' },
    body: { whereConditions: {}, orderConditions: { updatedAt: undefined } }
  });
  const res = makeRes();
  await getPostComments(req as Request, res as Response, next);

  expect(commentService.selectPostLevel1Comments).toHaveBeenCalledWith(10,
    expect.objectContaining({
      orderConditions: {}   // falsy → không spread
    })
  );
});
});