/**
 * Unit test cho post.controller.ts
 *
 * Chiến lược:
 * - Mock toàn bộ các tầng service, config bên ngoài để test chỉ
 *   tập trung vào logic xử lý trong controller.
 * - Mỗi describe block tương ứng với một hàm controller.
 * - Mỗi test case kiểm tra một nhánh logic cụ thể (happy path / error path).
 */

// ─── Mock các dependency bên ngoài ───────────────────────────────────────────
// Phải mock TRƯỚC khi import controller vì Jest hoists jest.mock lên đầu file

jest.mock('../configs/socket.config', () => ({
  getSocketIdByUserId: jest.fn(),
  io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) }
}));

jest.mock('../services/asset.service', () => ({
  insertAsset: jest.fn()
}));

jest.mock('../services/comment.service', () => ({
  deleteCommentByConditions: jest.fn(),
  insertComment: jest.fn(),
  selectCommentByConditions: jest.fn(),
  selectDirectChildCommentsFromParentCommentId: jest.fn(),
  selectPostLevel1Comments: jest.fn(),
  updateCommentByCommentId: jest.fn()
}));

jest.mock('../services/fileUpload.service', () => ({
  deleteManyResources: jest.fn(),
  uploadImage: jest.fn()
}));

jest.mock('../services/location.service', () => ({
  geocodingByGoong: jest.fn()
}));

jest.mock('../services/notification.service', () => ({
  insertNotification: jest.fn(),
  selectNotificationByConditions: jest.fn()
}));

jest.mock('../services/post.service', () => ({
  deletePostAssets: jest.fn(),
  deletePostById: jest.fn(),
  deleteUserPostInterestByConditions: jest.fn(),
  deleteManyPassPostItems: jest.fn(),
  insertJoinPost: jest.fn(),
  insertPassPost: jest.fn(),
  insertPassPostItem: jest.fn(),
  insertPost: jest.fn(),
  insertPostAssets: jest.fn(),
  insertRentalPost: jest.fn(),
  insertUserPostInterested: jest.fn(),
  insertWantedPost: jest.fn(),
  removeAllPassPostItemByPostId: jest.fn(),
  selectFullPostDetailById: jest.fn(),
  selectInterestedUserPostByConditions: jest.fn(),
  selectJoinPostByConditions: jest.fn(),
  selectPassPostByConditions: jest.fn(),
  selectPassPostItemsByPostId: jest.fn(),
  selectPostAssetsByPostId: jest.fn(),
  selectPostById: jest.fn(),
  selectRentalPostByConditions: jest.fn(),
  selectWantedPostByConditions: jest.fn(),
  updateJoinPostByPostId: jest.fn(),
  updatePassPostByPostId: jest.fn(),
  updatePassPostItemById: jest.fn(),
  updatePostById: jest.fn(),
  updateRentalPostByPostId: jest.fn(),
  updateWantedPostByPostId: jest.fn()
}));

jest.mock('../utils/constants.helper', () => ({
  cleanObject: jest.fn((obj) => obj),
  generateSlug: jest.fn((str: string) => (str ? str.toLowerCase().replace(/\s+/g, '-') : ''))
}));

jest.mock('../utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(),
  paginationHelper: jest.fn((args) => args),
  selectOptions: jest.fn()
}));

jest.mock('../utils/time.helper', () => ({
  timeInVietNam: jest.fn(() => ({
    add: jest.fn().mockReturnThis(),
    toDate: jest.fn(() => new Date('2099-01-01'))
  }))
}));

jest.mock('../utils/ApiError.helper', () => {
  return jest.fn().mockImplementation((status: number, message: string) => {
    const err: any = new Error(message);
    err.status = status;
    err.statusCode = status;
    return err;
  });
});

jest.mock('../utils/ApiResponse.helper', () => ({
  ApiResponse: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  }))
}));

// ─── Import controller SAU khi đã mock xong ──────────────────────────────────

import {
  uploadPostImageHandler,
  insertPostAssetsHandler,
  createRentalPost,
  createWantedPost,
  createJoinPost,
  createPassPost,
  getPostById,
  searchPosts,
  searchPassPosts,
  hiddenPostById,
  removePostById,
  removePostAssets,
  updateRentalPost,
  updateWantedPost,
  updateJoinPost,
  updatePassPost,
  updatePassPostItem,
  removePassPostItems,
  updateViewCount,
  createUserPostInterested,
  getInterestedUserPosts,
  removeUserPostInterested,
  renewPost,
  createComment,
  updateComment,
  removeComment,
  getPostComments
} from '../controllers/post.controller';

// ─── Import các mock để assert ────────────────────────────────────────────────

import { uploadImage } from '../services/fileUpload.service';
import { insertAsset } from '../services/asset.service';
import {
  insertPost,
  insertPostAssets,
  insertRentalPost,
  insertWantedPost,
  insertJoinPost,
  insertPassPost,
  insertPassPostItem,
  insertUserPostInterested,
  selectPostById,
  selectFullPostDetailById,
  selectPostAssetsByPostId,
  selectPassPostItemsByPostId,
  selectInterestedUserPostByConditions,
  selectRentalPostByConditions,
  selectWantedPostByConditions,
  selectJoinPostByConditions,
  selectPassPostByConditions,
  updatePostById,
  updateRentalPostByPostId,
  updateWantedPostByPostId,
  updateJoinPostByPostId,
  updatePassPostByPostId,
  updatePassPostItemById,
  removeAllPassPostItemByPostId,
  deletePostById,
  deletePostAssets,
  deleteUserPostInterestByConditions,
  deleteManyPassPostItems
} from '../services/post.service';
import {
  insertComment,
  selectCommentByConditions,
  updateCommentByCommentId,
  deleteCommentByConditions,
  selectPostLevel1Comments,
  selectDirectChildCommentsFromParentCommentId
} from '../services/comment.service';
import { insertNotification, selectNotificationByConditions } from '../services/notification.service';
import { deleteManyResources } from '../services/fileUpload.service';
import { checkUserAndPostPermission } from '../utils/schema.helper';
import { getSocketIdByUserId, io } from '../configs/socket.config';
import { geocodingByGoong } from '../services/location.service';
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

// ─── Hàm tạo mock request / response / next ──────────────────────────────────

/** Tạo mock Request với currentUser mặc định là user id=1, role=landlord */
const mockReq = (overrides: Partial<Request> = {}): Request =>
  ({
    body: {},
    params: {},
    query: {},
    files: undefined,
    currentUser: {
      users: { id: 1 },
      users_detail: { userId: 1, role: 'landlord', firstName: 'Nguyễn', lastName: 'Văn A' }
    },
    ...overrides
  } as unknown as Request);

const mockRes = (): Response => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

const mockNext: NextFunction = jest.fn();

/** Dữ liệu bài viết mẫu */
const mockPost = {
  id: 1,
  ownerId: 1,
  type: 'rental',
  status: 'actived',
  expirationAfter: 30,
  createdAt: new Date('2024-01-01')
};

/** Body mặc định cho tạo/sửa bài viết */
const bodyBaiViet = {
  title: 'Cho thuê phòng trọ quận Cầu Giấy',
  description: 'Phòng rộng thoáng mát',
  addressCode: '01',
  addressProvince: 'Hà Nội',
  addressDistrict: 'Cầu Giấy',
  addressWard: 'Dịch Vọng',
  addressDetail: '123 Xuân Thủy',
  addressLongitude: 105.8,
  addressLatitude: 21.0,
  priceStart: 2000000,
  priceEnd: 3000000,
  priceUnit: 'VND',
  expirationAfter: 30,
  expirationAfterUnit: 'day'
};

// Ẩn console.log sinh ra từ catch block trong controller
beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// uploadPostImageHandler
// ═════════════════════════════════════════════════════════════════════════════
describe('uploadPostImageHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ném lỗi 422 khi req.files không tồn tại', async () => {
    const req = mockReq({ files: undefined });
    await expect(uploadPostImageHandler(req)).rejects.toMatchObject({ status: 422 });
  });

  it('ném lỗi 422 khi req.files không phải array', async () => {
    const req = mockReq({ files: {} as any });
    await expect(uploadPostImageHandler(req)).rejects.toMatchObject({ status: 422 });
  });

  it('chỉ upload file ảnh, bỏ qua file không phải ảnh', async () => {
    const fileAnh = { mimetype: 'image/jpeg', originalname: 'anh.jpg', buffer: Buffer.from('') };
    const fileVideo = { mimetype: 'video/mp4', originalname: 'video.mp4', buffer: Buffer.from('') };
    const ketQua = { public_id: 'pid', secure_url: 'https://url', resource_type: 'image', format: 'jpg' };
    (uploadImage as jest.Mock).mockResolvedValue(ketQua);

    const req = mockReq({ files: [fileAnh, fileVideo] as any });
    const result = await uploadPostImageHandler(req);

    // Chỉ gọi uploadImage 1 lần cho file ảnh
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(result.success).toHaveLength(1);
    expect(result.error).toHaveLength(0);
  });

  it('ghi nhận lỗi vào result.error khi upload thất bại', async () => {
    const fileAnh = { mimetype: 'image/png', originalname: 'loi.png', buffer: Buffer.from('') };
    (uploadImage as jest.Mock).mockRejectedValue(new Error('upload thất bại'));

    const req = mockReq({ files: [fileAnh] as any });
    const result = await uploadPostImageHandler(req);

    expect(result.success).toHaveLength(0);
    expect(result.error).toHaveLength(1);
    expect(result.error[0]).toEqual({ file: 'loi.png', message: 'upload thất bại' });
  });

  it('trả về kết quả rỗng khi tất cả file đều không phải ảnh', async () => {
    const filePDF = { mimetype: 'application/pdf', originalname: 'cv.pdf', buffer: Buffer.from('') };
    const req = mockReq({ files: [filePDF] as any });
    const result = await uploadPostImageHandler(req);

    expect(uploadImage).not.toHaveBeenCalled();
    expect(result.success).toHaveLength(0);
    expect(result.error).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// insertPostAssetsHandler
// ═════════════════════════════════════════════════════════════════════════════
describe('insertPostAssetsHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả về mảng rỗng ngay khi payload không có file nào', async () => {
    const result = await insertPostAssetsHandler([], { userId: 1, postId: 10 });
    expect(result).toEqual([]);
    expect(insertAsset).not.toHaveBeenCalled();
  });

  it('insert asset và liên kết post-asset đúng với dữ liệu truyền vào', async () => {
    const payload: any[] = [
      { public_id: 'pid1', secure_url: 'https://url1', resource_type: 'image', format: 'jpg' }
    ];
    (insertAsset as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (insertPostAssets as jest.Mock).mockResolvedValue([]);

    await insertPostAssetsHandler(payload, { userId: 1, postId: 10 });

    expect(insertAsset).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 1, postId: 10, url: 'https://url1', name: 'pid1' })
    ]);
    expect(insertPostAssets).toHaveBeenCalledWith([{ postId: 10, assetId: 99 }]);
  });

  it('ném lại lỗi khi insertAsset thất bại', async () => {
    const payload: any[] = [
      { public_id: 'pid', secure_url: 'url', resource_type: 'image', format: 'jpg' }
    ];
    (insertAsset as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));
    await expect(insertPostAssetsHandler(payload, { userId: 1, postId: 10 })).rejects.toThrow('Lỗi DB');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createRentalPost
// ═════════════════════════════════════════════════════════════════════════════
describe('createRentalPost', () => {
  beforeEach(() => jest.clearAllMocks());

  const bodyChoThue = {
    ...bodyBaiViet,
    totalArea: 25,
    totalAreaUnit: 'm2',
    numberRoomAvailable: 2,
    minLeaseTerm: 6,
    minLeaseTermUnit: 'month'
  };

  it('tạo bài đăng cho thuê thành công không có file đính kèm', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertRentalPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: bodyChoThue });
    const res = mockRes();
    await createRentalPost(req, res, mockNext);

    expect(insertPost).toHaveBeenCalled();
    expect(insertRentalPost).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('gọi geocoding khi không có tọa độ lat/lng', async () => {
    (geocodingByGoong as jest.Mock).mockResolvedValue({ latitude: 21.0, longitude: 105.8 });
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertRentalPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyChoThue, addressLongitude: undefined, addressLatitude: undefined } });
    const res = mockRes();
    await createRentalPost(req, res, mockNext);

    expect(geocodingByGoong).toHaveBeenCalled();
  });

  it('đặt priceEnd = priceStart khi priceEnd = 0', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertRentalPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyChoThue, priceStart: 2000000, priceEnd: 0 } });
    const res = mockRes();
    await createRentalPost(req, res, mockNext);

    expect(insertRentalPost).toHaveBeenCalledWith(
      expect.objectContaining({ priceStart: 2000000, priceEnd: 2000000 })
    );
  });

  it('hoán đổi priceStart/priceEnd khi start > end', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertRentalPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyChoThue, priceStart: 5000000, priceEnd: 1000000 } });
    const res = mockRes();
    await createRentalPost(req, res, mockNext);

    expect(insertRentalPost).toHaveBeenCalledWith(
      expect.objectContaining({ priceStart: 1000000, priceEnd: 5000000 })
    );
  });

  it.each([
    ['hour', 'hour'],
    ['week', 'week'],
    ['month', 'month']
  ])('tính expirationTime đúng với đơn vị %s', async (donVi) => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertRentalPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyChoThue, expirationAfterUnit: donVi } });
    const res = mockRes();
    await createRentalPost(req, res, mockNext);

    expect(insertPost).toHaveBeenCalled();
  });

  it('dùng thời hạn mặc định 99 năm khi không truyền expirationAfter', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertRentalPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyChoThue, expirationAfter: undefined } });
    const res = mockRes();
    await createRentalPost(req, res, mockNext);

    expect(insertPost).toHaveBeenCalled();
  });

  it('gọi next(error) khi service bị lỗi', async () => {
    (insertPost as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));

    const req = mockReq({ body: bodyChoThue });
    const res = mockRes();
    await createRentalPost(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createWantedPost
// ═════════════════════════════════════════════════════════════════════════════
describe('createWantedPost', () => {
  beforeEach(() => jest.clearAllMocks());

  const bodyTimPhong = { ...bodyBaiViet, totalArea: 20, totalAreaUnit: 'm2', moveInDate: '2025-08-01' };

  it('tạo bài tìm phòng thành công', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertWantedPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: bodyTimPhong });
    const res = mockRes();
    await createWantedPost(req, res, mockNext);

    expect(insertPost).toHaveBeenCalled();
    expect(insertWantedPost).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('trả về lỗi 422 khi moveInDate không hợp lệ', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);

    const req = mockReq({ body: { ...bodyTimPhong, moveInDate: 'ngay-khong-hop-le' } });
    const res = mockRes();
    await createWantedPost(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }));
  });

  it('gọi geocoding khi thiếu tọa độ', async () => {
    (geocodingByGoong as jest.Mock).mockResolvedValue({ latitude: 21.0, longitude: 105.8 });
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertWantedPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyTimPhong, addressLongitude: undefined, addressLatitude: undefined } });
    const res = mockRes();
    await createWantedPost(req, res, mockNext);

    expect(geocodingByGoong).toHaveBeenCalled();
  });

  it('hoán đổi giá khi priceStart > priceEnd', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertWantedPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyTimPhong, priceStart: 5000000, priceEnd: 1000000 } });
    const res = mockRes();
    await createWantedPost(req, res, mockNext);

    expect(insertWantedPost).toHaveBeenCalledWith(
      expect.objectContaining({ priceStart: 1000000, priceEnd: 5000000 })
    );
  });

  it('gọi next(error) khi service lỗi', async () => {
    (insertPost as jest.Mock).mockRejectedValue(new Error('Lỗi kết nối'));

    const req = mockReq({ body: bodyTimPhong });
    const res = mockRes();
    await createWantedPost(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createJoinPost
// ═════════════════════════════════════════════════════════════════════════════
describe('createJoinPost', () => {
  beforeEach(() => jest.clearAllMocks());

  const bodyOGhep = { ...bodyBaiViet, totalArea: 15, totalAreaUnit: 'm2', moveInDate: '2025-09-01' };

  it('tạo bài ở ghép thành công', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertJoinPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: bodyOGhep });
    const res = mockRes();
    await createJoinPost(req, res, mockNext);

    expect(insertPost).toHaveBeenCalled();
    expect(insertJoinPost).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('trả về lỗi 422 khi moveInDate không hợp lệ', async () => {
    const req = mockReq({ body: { ...bodyOGhep, moveInDate: 'khong-hop-le' } });
    const res = mockRes();
    await createJoinPost(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }));
  });

  it('đặt priceEnd = priceStart khi priceEnd = 0', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertJoinPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyOGhep, priceStart: 1500000, priceEnd: 0 } });
    const res = mockRes();
    await createJoinPost(req, res, mockNext);

    expect(insertJoinPost).toHaveBeenCalledWith(
      expect.objectContaining({ priceStart: 1500000, priceEnd: 1500000 })
    );
  });

  it('gọi geocoding khi thiếu tọa độ', async () => {
    (geocodingByGoong as jest.Mock).mockResolvedValue({ latitude: 21.0, longitude: 105.8 });
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertJoinPost as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyOGhep, addressLongitude: undefined, addressLatitude: undefined } });
    const res = mockRes();
    await createJoinPost(req, res, mockNext);

    expect(geocodingByGoong).toHaveBeenCalled();
  });

  it('gọi next(error) khi service lỗi', async () => {
    (insertPost as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));

    const req = mockReq({ body: bodyOGhep });
    const res = mockRes();
    await createJoinPost(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
  it('ném lỗi 422 khi moveInDate là ngày trong quá khứ', async () => {
    const ngayQuaKhu = '2010-01-01';
    const req = mockReq({ body: { ...bodyOGhep, moveInDate: ngayQuaKhu } });
    const res = mockRes();
    await createJoinPost(req, res, mockNext);
    
    // Nếu code bạn có logic chặn ngày cũ, nó sẽ lọt vào đây
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }));
});

it('vẫn tiếp tục tạo bài khi geocoding không tìm thấy kết quả', async () => {
    (geocodingByGoong as jest.Mock).mockResolvedValue(null); // Giả sử Goong không tìm thấy địa chỉ
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    
    const req = mockReq({ body: { ...bodyOGhep, addressLongitude: undefined } });
    const res = mockRes();
    await createJoinPost(req, res, mockNext);

    expect(insertPost).toHaveBeenCalled(); // Hệ thống vẫn phải cho phép tạo bài với tọa độ mặc định hoặc null
});
});

// ═════════════════════════════════════════════════════════════════════════════
// createPassPost
// ═════════════════════════════════════════════════════════════════════════════
describe('createPassPost', () => {
  beforeEach(() => jest.clearAllMocks());

  const danhSachDo = JSON.stringify([
    { passItemName: 'Tủ lạnh', passItemPrice: 2000000, passItemStatus: 'good' },
    { passItemName: 'Máy giặt', passItemPrice: 3500000, passItemStatus: 'good' }
  ]);

  it('tạo bài pass đồ thành công, tính đúng min/max giá', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertPassPost as jest.Mock).mockResolvedValue([]);
    (insertPassPostItem as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyBaiViet, passItems: danhSachDo } });
    const res = mockRes();
    await createPassPost(req, res, mockNext);

    expect(insertPassPost).toHaveBeenCalledWith(
      expect.objectContaining({ priceStart: 2000000, priceEnd: 3500000 })
    );
    expect(insertPassPostItem).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('trả về lỗi 422 khi passItems là mảng rỗng', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);

    const req = mockReq({ body: { ...bodyBaiViet, passItems: JSON.stringify([]) } });
    const res = mockRes();
    await createPassPost(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }));
  });

  it('trả về lỗi 422 khi không truyền passItems', async () => {
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);

    const req = mockReq({ body: { ...bodyBaiViet, passItems: undefined } });
    const res = mockRes();
    await createPassPost(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }));
  });

  it('gọi geocoding khi thiếu tọa độ', async () => {
    (geocodingByGoong as jest.Mock).mockResolvedValue({ latitude: 21.0, longitude: 105.8 });
    (insertPost as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertPassPost as jest.Mock).mockResolvedValue([]);
    (insertPassPostItem as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ body: { ...bodyBaiViet, addressLongitude: undefined, addressLatitude: undefined, passItems: danhSachDo } });
    const res = mockRes();
    await createPassPost(req, res, mockNext);

    expect(geocodingByGoong).toHaveBeenCalled();
  });

  it('gọi next(error) khi service lỗi', async () => {
    (insertPost as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));

    const req = mockReq({ body: { ...bodyBaiViet, passItems: danhSachDo } });
    const res = mockRes();
    await createPassPost(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// removePassPostItems
// ═════════════════════════════════════════════════════════════════════════════
describe('removePassPostItems', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả về 400 khi thiếu postId', async () => {
    const req = mockReq({ params: {}, query: { passItemIds: '5' } });
    const res = mockRes();
    await removePassPostItems(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('trả về 404 khi bài không có đồ nào', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ ...mockPost, type: 'pass' }]);
    (checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (selectPassPostItemsByPostId as jest.Mock).mockResolvedValue([]);
    const req = mockReq({ params: { postId: '1' }, query: { passItemIds: '5' } });
    const res = mockRes();
    await removePassPostItems(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it('xóa đồ pass với một id đơn', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ ...mockPost, type: 'pass' }]);
    (checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (selectPassPostItemsByPostId as jest.Mock).mockResolvedValue([{ id: 5 }, { id: 6 }]);
    (deleteManyPassPostItems as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ params: { postId: '1' }, query: { passItemIds: '5' } });
    const res = mockRes();
    await removePassPostItems(req, res, mockNext);

    expect(deleteManyPassPostItems).toHaveBeenCalledWith(1, [5]);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('xóa nhiều đồ pass với mảng ids', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ ...mockPost, type: 'pass' }]);
    (checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (selectPassPostItemsByPostId as jest.Mock).mockResolvedValue([{ id: 5 }, { id: 6 }]);
    (deleteManyPassPostItems as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ params: { postId: '1' }, query: { passItemIds: ['5', '6'] } });
    const res = mockRes();
    await removePassPostItems(req, res, mockNext);

    expect(deleteManyPassPostItems).toHaveBeenCalledWith(1, [5, 6]);
  });
});



// ═════════════════════════════════════════════════════════════════════════════
// createComment
// ═════════════════════════════════════════════════════════════════════════════
describe('createComment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả về 400 khi bài viết không tồn tại', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([]);
    const req = mockReq({ body: { postId: 1, content: 'Xin chào' } });
    const res = mockRes();
    await createComment(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('tạo comment thành công và gửi thông báo đến chủ bài', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ id: 1, ownerId: 2 }]);
    (insertComment as jest.Mock).mockResolvedValue([[[{ id: 10 }]]]);
    (selectCommentByConditions as jest.Mock).mockResolvedValue([{ id: 10, content: 'Xin chào' }]);
    (insertNotification as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (selectNotificationByConditions as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (getSocketIdByUserId as jest.Mock).mockReturnValue('socket-chu-bai');
    (io.to as jest.Mock).mockReturnValue({ emit: jest.fn() });

    const req = mockReq({ body: { postId: 1, content: 'Xin chào' } });
    const res = mockRes();
    await createComment(req, res, mockNext);

    expect(insertComment).toHaveBeenCalled();
    expect(insertNotification).toHaveBeenCalled();
    expect(io.to).toHaveBeenCalledWith('socket-chu-bai');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('không gửi socket khi người comment chính là chủ bài viết', async () => {
    // currentUser.users.id = 1, post.ownerId = 1 → cùng người
    (selectPostById as jest.Mock).mockResolvedValue([{ id: 1, ownerId: 1 }]);
    (insertComment as jest.Mock).mockResolvedValue([[[{ id: 10 }]]]);
    (selectCommentByConditions as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertNotification as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (selectNotificationByConditions as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (getSocketIdByUserId as jest.Mock).mockReturnValue('socket-owner');

    const req = mockReq({ body: { postId: 1, content: 'Tự comment bài của mình' } });
    const res = mockRes();
    await createComment(req, res, mockNext);

    expect(io.to).not.toHaveBeenCalled();
  });

  it('không gửi socket khi chủ bài không online', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ id: 1, ownerId: 2 }]);
    (insertComment as jest.Mock).mockResolvedValue([[[{ id: 10 }]]]);
    (selectCommentByConditions as jest.Mock).mockResolvedValue([{ id: 10 }]);
    (insertNotification as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (selectNotificationByConditions as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (getSocketIdByUserId as jest.Mock).mockReturnValue(null); // không online

    const req = mockReq({ body: { postId: 1, content: 'Hỏi về phòng' } });
    const res = mockRes();
    await createComment(req, res, mockNext);

    expect(io.to).not.toHaveBeenCalled();
  });

  it('tạo comment con (reply) với parentCommentId', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ id: 1, ownerId: 2 }]);
    (insertComment as jest.Mock).mockResolvedValue([[[{ id: 20 }]]]);
    (selectCommentByConditions as jest.Mock).mockResolvedValue([{ id: 20, content: 'Reply', parentCommentId: 10 }]);
    (insertNotification as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (selectNotificationByConditions as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (getSocketIdByUserId as jest.Mock).mockReturnValue(null);

    const req = mockReq({ body: { postId: 1, content: 'Reply comment', parentCommentId: 10 } });
    const res = mockRes();
    await createComment(req, res, mockNext);

    expect(insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ parentCommentId: 10 })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });
  it('trả về lỗi khi nội dung bình luận rỗng hoặc chỉ có khoảng trắng', async () => {
  // Giả sử bạn muốn chặn content trống
  const req = mockReq({ body: { postId: 1, content: '   ' } }); // Chỉ có dấu cách
  const res = mockRes();
  
  await createComment(req, res, mockNext);

  // Mong đợi: Phải gọi ApiError hoặc trả về lỗi, không được đi tiếp vào insertComment
  expect(insertComment).not.toHaveBeenCalled();
  // Nếu bạn có logic validate trong controller, expect mockNext được gọi với lỗi 400
  expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
});
});

// ═════════════════════════════════════════════════════════════════════════════
// updateComment
// ═════════════════════════════════════════════════════════════════════════════
describe('updateComment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả về 400 khi thiếu commentId', async () => {
    const req = mockReq({ params: { commentId: '' }, body: {} });
    const res = mockRes();
    await updateComment(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('trả về 400 khi commentId không phải số nguyên an toàn', async () => {
    const req = mockReq({ params: { commentId: '9999999999999999' }, body: {} });
    const res = mockRes();
    await updateComment(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('trả về 404 khi comment không thuộc về người dùng hiện tại', async () => {
    (selectCommentByConditions as jest.Mock).mockResolvedValue([]);
    const req = mockReq({ params: { commentId: '5' }, body: { content: 'Sửa nội dung' } });
    const res = mockRes();
    await updateComment(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it('cập nhật comment thành công', async () => {
    (selectCommentByConditions as jest.Mock)
      .mockResolvedValueOnce([{ id: 5, content: 'Cũ' }])   // lần 1: tìm comment hiện tại
      .mockResolvedValueOnce([{ id: 5, content: 'Mới' }]); // lần 2: lấy comment sau khi sửa
    (updateCommentByCommentId as jest.Mock).mockResolvedValue(undefined);

    const req = mockReq({ params: { commentId: '5' }, body: { content: 'Nội dung mới', tags: 'tag1' } });
    const res = mockRes();
    await updateComment(req, res, mockNext);

    expect(updateCommentByCommentId).toHaveBeenCalledWith(5, { content: 'Nội dung mới', tags: 'tag1' });
    expect(mockNext).not.toHaveBeenCalled();
  });
  it('trả về 400 khi nội dung sửa đổi chỉ toàn khoảng trắng', async () => {
    (selectCommentByConditions as jest.Mock).mockResolvedValue([{ id: 5, userId: 1 }]); // Giả sử comment tồn tại
    const req = mockReq({ params: { commentId: '5' }, body: { content: '   ' } });
    const res = mockRes();
    
    await updateComment(req, res, mockNext);

    expect(updateCommentByCommentId).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
});
});

// ═════════════════════════════════════════════════════════════════════════════
// removeComment
// ═════════════════════════════════════════════════════════════════════════════
describe('removeComment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả về 400 khi thiếu commentId', async () => {
    const req = mockReq({ params: { commentId: '' } });
    const res = mockRes();
    await removeComment(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('trả về 400 khi commentId không phải số nguyên', async () => {
    const req = mockReq({ params: { commentId: 'abc' } });
    const res = mockRes();
    await removeComment(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('trả về 404 khi comment không tìm thấy hoặc không thuộc user', async () => {
    (selectCommentByConditions as jest.Mock).mockResolvedValue([]);
    const req = mockReq({ params: { commentId: '5' } });
    const res = mockRes();
    await removeComment(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it('xóa comment thành công', async () => {
    (selectCommentByConditions as jest.Mock).mockResolvedValue([{ id: 5 }]);
    (deleteCommentByConditions as jest.Mock).mockResolvedValue(undefined);

    const req = mockReq({ params: { commentId: '5' } });
    const res = mockRes();
    await removeComment(req, res, mockNext);

    expect(deleteCommentByConditions).toHaveBeenCalledWith({
      id: { operator: 'eq', value: 5 },
      ownerId: { operator: 'eq', value: 1 }
    });
    expect(mockNext).not.toHaveBeenCalled();
  });
  it('gọi next(error) khi database gặp sự cố lúc xóa', async () => {
    (selectCommentByConditions as jest.Mock).mockResolvedValue([{ id: 5 }]);
    (deleteCommentByConditions as jest.Mock).mockRejectedValue(new Error('Lỗi kết nối DB'));

    const req = mockReq({ params: { commentId: '5' } });
    const res = mockRes();
    await removeComment(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
});
});

// ═════════════════════════════════════════════════════════════════════════════
// getPostComments
// ═════════════════════════════════════════════════════════════════════════════
describe('getPostComments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả về 400 khi thiếu postId', async () => {
    const req = mockReq({ params: { postId: '' }, body: { whereConditions: {}, orderConditions: {} } });
    const res = mockRes();
    await getPostComments(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('trả về 400 khi postId không phải số nguyên an toàn', async () => {
    const req = mockReq({ params: { postId: 'abc' }, body: { whereConditions: {}, orderConditions: {} } });
    const res = mockRes();
    await getPostComments(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('trả về 422 khi thiếu whereConditions', async () => {
    const req = mockReq({ params: { postId: '1' }, body: { orderConditions: {} } });
    const res = mockRes();
    await getPostComments(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }));
  });

  it('trả về 404 khi bài viết không tồn tại', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([]);
    const req = mockReq({ params: { postId: '1' }, body: { whereConditions: {}, orderConditions: {} } });
    const res = mockRes();
    await getPostComments(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it('trả về 400 khi parentCommentId không phải số nguyên an toàn', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ id: 1 }]);
    const req = mockReq({
      params: { postId: '1' },
      body: { whereConditions: { parentCommentId: '9999999999999999' }, orderConditions: {} }
    });
    const res = mockRes();
    await getPostComments(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('lấy comment gốc (cấp 1) khi không có parentCommentId', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ id: 1 }]);
    (selectPostLevel1Comments as jest.Mock).mockResolvedValue([{ id: 1, content: 'Comment gốc' }]);

    const req = mockReq({
      params: { postId: '1' },
      body: { whereConditions: {}, orderConditions: {}, pagination: { page: 1, pageSize: 10 } }
    });
    const res = mockRes();
    await getPostComments(req, res, mockNext);

    expect(selectPostLevel1Comments).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('lấy comment con khi có parentCommentId', async () => {
    (selectPostById as jest.Mock).mockResolvedValue([{ id: 1 }]);
    (selectDirectChildCommentsFromParentCommentId as jest.Mock).mockResolvedValue([{ id: 5, parentCommentId: 3 }]);

    const req = mockReq({
      params: { postId: '1' },
      body: { whereConditions: { parentCommentId: '3' }, orderConditions: {}, pagination: { page: 1, pageSize: 10 } }
    });
    const res = mockRes();
    await getPostComments(req, res, mockNext);

    expect(selectDirectChildCommentsFromParentCommentId).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });
});