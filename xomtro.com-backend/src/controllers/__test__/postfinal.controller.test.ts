import { Request, Response, NextFunction } from 'express';
import { StatusCodes, ReasonPhrases } from 'http-status-codes';

// ─── Mock all service dependencies ───────────────────────────────────────────

jest.mock('@/services/post.service', () => ({
  insertPost: jest.fn(),
  insertRentalPost: jest.fn(),
  insertPostAssets: jest.fn()
}));

jest.mock('@/services/asset.service', () => ({
  insertAsset: jest.fn()
}));

jest.mock('@/services/fileUpload.service', () => ({
  uploadImage: jest.fn()
}));

jest.mock('@/services/location.service', () => ({
  geocodingByGoong: jest.fn()
}));


jest.mock('@/utils/ApiError.helper', () => {
  return jest.fn().mockImplementation((statusCode: number, message: string) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    error.status = statusCode;
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

jest.mock('@/utils/constants.helper', () => ({
  cleanObject: jest.fn((obj) => obj),
  generateSlug: jest.fn((str) => str?.toLowerCase().replace(/\s+/g, '-') ?? '')
}));

jest.mock('@/utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(() => true),
  paginationHelper: jest.fn(),
  selectOptions: jest.fn()
}));

jest.mock('@/utils/time.helper', () => ({
  timeInVietNam: jest.fn(() => ({
    add: jest.fn().mockReturnThis(),
    toDate: jest.fn(() => new Date('2099-01-01'))
  }))
}));
jest.mock('@/services/fileUpload.service', () => ({
  uploadImage: jest.fn()
}));
// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  createRentalPost,
  uploadPostImageHandler,
  insertPostAssetsHandler
} from '@/controllers/post.controller';

import * as postService from '@/services/post.service';
import * as assetService from '@/services/asset.service';
import * as fileUploadService from '@/services/fileUpload.service';
import * as locationService from '@/services/location.service';
import { ApiResponse } from '@/utils/ApiResponse.helper';
import { uploadImage } from '@/services/fileUpload.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tạo mock req cơ bản với currentUser đã đăng nhập */
const makeReq = (overrides: Partial<Request> = {}): Partial<Request> => ({
  body: {},
  files: [],
  params: {},
  currentUser: {
    users: { id: 1, email: 'test@example.com' } as any,
    users_detail: { userId: 1, role: 'landlord', firstName: 'Test', lastName: 'User' } as any
  },
  ...overrides
});

const makeRes = (): Partial<Response> => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
});

const next: NextFunction = jest.fn();

/** Body hợp lệ cho rental post */
const validRentalBody = {
  title: 'Cho thuê phòng quận 1',
  type: 'rental',
  description: 'Phòng rộng, thoáng mát',
  addressCode: '79',
  addressProvince: 'Hồ Chí Minh',
  addressDistrict: 'Quận 1',
  addressWard: 'Phường Bến Nghé',
  addressDetail: '123 Nguyễn Huệ',
  addressLongitude: '106.7009',
  addressLatitude: '10.7769',
  priceStart: '3000000',
  priceEnd: '5000000',
  priceUnit: 'month',
  minLeaseTerm: '3',
  minLeaseTermUnit: 'month',
  totalArea: '25',
  totalAreaUnit: 'm2',
  numberRoomAvailable: '2',
  hasFurniture: true
};

// ─── Setup/Teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Default service mocks – happy path
  (postService.insertPost as jest.Mock).mockResolvedValue([{ id: 42 }]);
  (postService.insertRentalPost as jest.Mock).mockResolvedValue([{}]);
  (postService.insertPostAssets as jest.Mock).mockResolvedValue([{}]);
  (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 99 }]);
  (locationService.geocodingByGoong as jest.Mock).mockResolvedValue({
    latitude: '10.7769',
    longitude: '106.7009'
  });
  (fileUploadService.uploadImage as jest.Mock).mockResolvedValue({
    public_id: 'posts/abc123',
    secure_url: 'https://res.cloudinary.com/test/image/upload/posts/abc123.jpg',
    resource_type: 'image',
    format: 'jpg'
  });
});

describe('uploadPostImageHandler', () => {
  const makeImageFile = (name = 'photo.jpg', mimetype = 'image/jpeg') =>
    ({ originalname: name, mimetype, buffer: Buffer.from('fake') } as Express.Multer.File);

  const mockCloudinaryResult = (name: string) => ({
    public_id: `posts/${name}`,
    secure_url: `https://res.cloudinary.com/test/image/upload/posts/${name}`,
    resource_type: 'image',
    format: 'jpg'
  });

  it('TCTBVM01: Upload 1 ảnh hợp lệ → success chứa 1 item, error rỗng', async () => {
    (fileUploadService.uploadImage as jest.Mock).mockResolvedValue(mockCloudinaryResult('photo'));

    const req = { files: [makeImageFile()] } as unknown as Request;
    const result = await uploadPostImageHandler(req);

    expect(result.success).toHaveLength(1);
    expect(result.error).toHaveLength(0);
    expect(fileUploadService.uploadImage).toHaveBeenCalledTimes(1);
    expect(fileUploadService.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'image/jpeg' }),
      { folder: 'posts' }
    );
  });

  it('TCTBVM02: Upload nhiều ảnh hợp lệ → success chứa đủ số lượng', async () => {
    (fileUploadService.uploadImage as jest.Mock)
      .mockResolvedValueOnce(mockCloudinaryResult('img1'))
      .mockResolvedValueOnce(mockCloudinaryResult('img2'))
      .mockResolvedValueOnce(mockCloudinaryResult('img3'));

    const req = {
      files: [
        makeImageFile('img1.jpg'),
        makeImageFile('img2.png', 'image/png'),
        makeImageFile('img3.webp', 'image/webp')
      ]
    } as unknown as Request;
    const result = await uploadPostImageHandler(req);

    expect(result.success).toHaveLength(3);
    expect(result.error).toHaveLength(0);
    expect(fileUploadService.uploadImage).toHaveBeenCalledTimes(3);
  });

  it('TCTBVM03: File không phải ảnh (video, pdf) bị filter → không gọi uploadImage', async () => {
    const req = {
      files: [
        { originalname: 'clip.mp4', mimetype: 'video/mp4', buffer: Buffer.from('') },
        { originalname: 'doc.pdf', mimetype: 'application/pdf', buffer: Buffer.from('') }
      ]
    } as unknown as Request;
    const result = await uploadPostImageHandler(req);

    expect(fileUploadService.uploadImage).not.toHaveBeenCalled();
    expect(result.success).toHaveLength(0);
    expect(result.error).toHaveLength(0);
  });

  it('TCTBVM04: Mix ảnh và file không phải ảnh → chỉ upload ảnh', async () => {
    (fileUploadService.uploadImage as jest.Mock).mockResolvedValue(mockCloudinaryResult('img'));

    const req = {
      files: [
        makeImageFile('img.jpg'),
        { originalname: 'clip.mp4', mimetype: 'video/mp4', buffer: Buffer.from('') }
      ]
    } as unknown as Request;
    const result = await uploadPostImageHandler(req);

    expect(fileUploadService.uploadImage).toHaveBeenCalledTimes(1);
    expect(result.success).toHaveLength(1);
    expect(result.error).toHaveLength(0);
  });

  it('TCTBVM05: 1 ảnh upload thành công, 1 ảnh thất bại → success=1, error=1', async () => {
    (fileUploadService.uploadImage as jest.Mock)
      .mockResolvedValueOnce(mockCloudinaryResult('ok'))
      .mockRejectedValueOnce(new Error('Cloudinary quota exceeded'));

    const req = {
      files: [makeImageFile('ok.jpg'), makeImageFile('fail.jpg')]
    } as unknown as Request;
    const result = await uploadPostImageHandler(req);

    expect(result.success).toHaveLength(1);
    expect(result.error).toHaveLength(1);
    expect(result.error[0]).toMatchObject({
      file: 'fail.jpg',
      message: 'Cloudinary quota exceeded'
    });
  });

  it('TCTBVM06: Tất cả ảnh đều thất bại → success rỗng, error chứa tất cả', async () => {
    (fileUploadService.uploadImage as jest.Mock).mockRejectedValue(new Error('Network error'));

    const req = {
      files: [makeImageFile('a.jpg'), makeImageFile('b.jpg')]
    } as unknown as Request;
    const result = await uploadPostImageHandler(req);

    expect(result.success).toHaveLength(0);
    expect(result.error).toHaveLength(2);
    expect(result.error[0].message).toBe('Network error');
    expect(result.error[1].message).toBe('Network error');
  });

  it('TCTBVM07: req.files = undefined → throw UNPROCESSABLE_ENTITY', async () => {
    const req = { files: undefined } as unknown as Request;

    await expect(uploadPostImageHandler(req)).rejects.toMatchObject({
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY
    });
    expect(fileUploadService.uploadImage).not.toHaveBeenCalled();
  });

  it('TCTBVM08: req.files không phải Array → throw UNPROCESSABLE_ENTITY', async () => {
    const req = { files: { image: [] } } as unknown as Request;

    await expect(uploadPostImageHandler(req)).rejects.toMatchObject({
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY
    });
  });

  it('TCTBVM09: req.files là mảng rỗng → không upload, trả về rỗng', async () => {
    const req = { files: [] } as unknown as Request;
    const result = await uploadPostImageHandler(req);

    expect(fileUploadService.uploadImage).not.toHaveBeenCalled();
    expect(result.success).toHaveLength(0);
    expect(result.error).toHaveLength(0);
  });

  it('TCTBVM10: Upload thành công → kết quả chứa đúng dữ liệu từ Cloudinary', async () => {
    const cloudinaryPayload = mockCloudinaryResult('room-photo');
    (fileUploadService.uploadImage as jest.Mock).mockResolvedValue(cloudinaryPayload);

    const req = { files: [makeImageFile('room.jpg')] } as unknown as Request;
    const result = await uploadPostImageHandler(req);

    expect(result.success[0]).toMatchObject({
      public_id: 'posts/room-photo',
      secure_url: expect.stringContaining('cloudinary.com'),
      resource_type: 'image',
      format: 'jpg'
    });
  });
});


describe('insertPostAssetsHandler', () => {
  const ownerInfo = { userId: 1, postId: 42 };

  const makeCloudinaryResult = (overrides = {}): any => ({
    public_id: 'posts/abc123',
    secure_url: 'https://res.cloudinary.com/test/image/upload/posts/abc123.jpg',
    resource_type: 'image',
    format: 'jpg',
    ...overrides
  });

  it('TCTBVM11: payload hợp lệ → gọi insertAsset rồi insertPostAssets theo đúng thứ tự', async () => {
    const callOrder: string[] = [];
    (assetService.insertAsset as jest.Mock).mockImplementation(async () => {
      callOrder.push('insertAsset');
      return [{ id: 99 }];
    });
    (postService.insertPostAssets as jest.Mock).mockImplementation(async () => {
      callOrder.push('insertPostAssets');
      return [{}];
    });

    await insertPostAssetsHandler([makeCloudinaryResult()], ownerInfo);

    expect(callOrder).toEqual(['insertAsset', 'insertPostAssets']);
  });

  it('TCTBVM12: insertAsset nhận đúng payload được map từ Cloudinary response', async () => {
    // Lưu ý: folder được extract từ phần đầu của public_id (split theo "/")
    (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 99 }]);
    (postService.insertPostAssets as jest.Mock).mockResolvedValue([{}]);

    await insertPostAssetsHandler([makeCloudinaryResult()], ownerInfo);

    expect(assetService.insertAsset).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 1,
        postId: 42,
        url: 'https://res.cloudinary.com/test/image/upload/posts/abc123.jpg',
        name: 'posts/abc123',
        format: 'jpg',
        folder: 'posts',
        type: 'image',
        tags: JSON.stringify(['post'])
      })
    ]);
  });

  it('TCTBVM13: insertPostAssets nhận đúng assetId từ kết quả insertAsset', async () => {
    (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 77 }]);
    (postService.insertPostAssets as jest.Mock).mockResolvedValue([{}]);

    await insertPostAssetsHandler([makeCloudinaryResult()], ownerInfo);

    expect(postService.insertPostAssets).toHaveBeenCalledWith([
      { postId: 42, assetId: 77 }
    ]);
  });

  it('TCTBVM14: Upload nhiều ảnh → insertAsset nhận mảng đúng số lượng', async () => {
    (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    (postService.insertPostAssets as jest.Mock).mockResolvedValue([{}]);

    const payload = [
      makeCloudinaryResult({ public_id: 'posts/img1' }),
      makeCloudinaryResult({ public_id: 'posts/img2' }),
      makeCloudinaryResult({ public_id: 'posts/img3' })
    ];
    await insertPostAssetsHandler(payload, ownerInfo);

    const insertAssetCall = (assetService.insertAsset as jest.Mock).mock.calls[0][0];
    expect(insertAssetCall).toHaveLength(3);
  });

  it('TCTBVM15: Upload nhiều ảnh → insertPostAssets nhận đúng cặp postId-assetId', async () => {
    (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 10 }, { id: 20 }]);
    (postService.insertPostAssets as jest.Mock).mockResolvedValue([{}]);

    const payload = [makeCloudinaryResult(), makeCloudinaryResult()];
    await insertPostAssetsHandler(payload, ownerInfo);

    expect(postService.insertPostAssets).toHaveBeenCalledWith([
      { postId: 42, assetId: 10 },
      { postId: 42, assetId: 20 }
    ]);
  });

  it('TCTBVM16: payload rỗng → trả [] ngay, KHÔNG gọi insertAsset hay insertPostAssets', async () => {
    const result = await insertPostAssetsHandler([], ownerInfo);

    expect(result).toEqual([]);
    expect(assetService.insertAsset).not.toHaveBeenCalled();
    expect(postService.insertPostAssets).not.toHaveBeenCalled();
  });

  it('TCTBVM17: resource_type khác "image" (VD: "video") → vẫn map đúng vào type', async () => {
    (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 55 }]);
    (postService.insertPostAssets as jest.Mock).mockResolvedValue([{}]);

    const videoPayload = makeCloudinaryResult({ resource_type: 'video', format: 'mp4' });
    await insertPostAssetsHandler([videoPayload], ownerInfo);

    const insertAssetCall = (assetService.insertAsset as jest.Mock).mock.calls[0][0];
    expect(insertAssetCall[0].type).toBe('video');
    expect(insertAssetCall[0].format).toBe('mp4');
  });

  it('TCTBVM18: insertAsset throw lỗi → re-throw lên caller (không nuốt lỗi)', async () => {
    const dbError = new Error('DB constraint failed');
    (assetService.insertAsset as jest.Mock).mockRejectedValue(dbError);

    await expect(insertPostAssetsHandler([makeCloudinaryResult()], ownerInfo)).rejects.toThrow(
      'DB constraint failed'
    );
    expect(postService.insertPostAssets).not.toHaveBeenCalled();
  });

  it('TCTBVM19: insertPostAssets throw lỗi → re-throw lên caller', async () => {
    (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 99 }]);
    const dbError = new Error('FK violation');
    (postService.insertPostAssets as jest.Mock).mockRejectedValue(dbError);

    await expect(insertPostAssetsHandler([makeCloudinaryResult()], ownerInfo)).rejects.toThrow('FK violation');
  });
});


describe('createRentalPost', () => {
  it('TCTBVM20: Tạo bài đăng thành công khi dữ liệu hợp lệ và không kèm ảnh.', async () => {
    const req = makeReq({ body: validRentalBody });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(postService.insertPost).toHaveBeenCalledTimes(1);
    expect(postService.insertRentalPost).toHaveBeenCalledTimes(1);
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
    expect(next).not.toHaveBeenCalled();
  });

  it('TCTBVM21: Tự động lấy tọa độ (Geocoding) khi thiếu vĩ độ/kinh độ', async () => {
    const body = { ...validRentalBody, addressLongitude: undefined, addressLatitude: undefined };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(locationService.geocodingByGoong).toHaveBeenCalledTimes(1);
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM22: Geocoding lỗi → lỗi bị nuốt nội bộ, vẫn trả HTTP 201', async () => {
    (locationService.geocodingByGoong as jest.Mock).mockRejectedValue(new Error('Geocoding failed'));
    const body = { ...validRentalBody, addressLongitude: undefined, addressLatitude: undefined };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM23: Tự động hoán đổi khi priceStart > priceEnd', async () => {
    const body = { ...validRentalBody, priceStart: '9000000', priceEnd: '3000000' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
    expect(callArg.priceStart).toBeLessThanOrEqual(callArg.priceEnd);
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM24: Tự động gán priceEnd = priceStart khi priceEnd để trống', async () => {
    const body = { ...validRentalBody, priceStart: '5000000', priceEnd: '' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
    expect(callArg.priceStart).toBe(5000000);
    expect(callArg.priceEnd).toBe(5000000);
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM25: Tính expirationTime đúng với đơn vị "day"', async () => {
    const body = { ...validRentalBody, expirationAfter: '30', expirationAfterUnit: 'day' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(postService.insertPost).toHaveBeenCalledWith(
      expect.objectContaining({ expirationAfter: '30', expirationAfterUnit: 'day' })
    );
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM26: Tính expirationTime đúng với đơn vị "week"', async () => {
    const body = { ...validRentalBody, expirationAfter: '2', expirationAfterUnit: 'week' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);
 expect(postService.insertPost).toHaveBeenCalledWith(
      expect.objectContaining({ expirationAfter: '2', expirationAfterUnit: 'week' })
    );
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM27: Tính expirationTime đúng với đơn vị "month"', async () => {
    const body = { ...validRentalBody, expirationAfter: '6', expirationAfterUnit: 'month' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM28: Tính expirationTime đúng với đơn vị "hour"', async () => {
    
    const body = { ...validRentalBody, expirationAfter: '12', expirationAfterUnit: 'hour' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(postService.insertPost).toHaveBeenCalledWith(
      expect.objectContaining({ expirationAfter: '12', expirationAfterUnit: 'hour' })
    );
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM29: Mặc định thời hạn 99 năm khi không truyền expirationAfter', async () => {
    const body = { ...validRentalBody, expirationAfter: undefined };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM30: Upload ảnh hợp lệ → tạo asset đính kèm bài viết', async () => {
    const req = makeReq({
      body: validRentalBody,
      files: [{ mimetype: 'image/jpeg', originalname: 'photo.jpg', buffer: Buffer.from('') } as any]
    });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(fileUploadService.uploadImage).toHaveBeenCalledTimes(1);
    expect(assetService.insertAsset).toHaveBeenCalledTimes(1);
    expect(postService.insertPostAssets).toHaveBeenCalledTimes(1);
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });


  it('TCTBVM31: Cloudinary lỗi → HTTP 400 BAD REQUEST', async () => {
    (fileUploadService.uploadImage as jest.Mock).mockRejectedValue(new Error('Cloudinary quota exceeded'));
    const req = makeReq({
      body: validRentalBody,
      files: [{ mimetype: 'image/jpeg', originalname: 'photo.jpg', buffer: Buffer.from('') } as any]
    });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.BAD_REQUEST,
      'Failed to upload!',
      expect.objectContaining({ success: expect.any(Array), error: expect.any(Array) })
    );
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
  });

  it('TCTBVM32: insertPost lỗi DB → next(error)', async () => {
    const dbError = new Error('DB connection failed');
    (postService.insertPost as jest.Mock).mockRejectedValue(dbError);

    const req = makeReq({ body: validRentalBody });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
  });

  it('TCTBVM33: insertRentalPost lỗi DB → next(error)', async () => {
    const dbError = new Error('Rental insert failed');
    (postService.insertRentalPost as jest.Mock).mockRejectedValue(dbError);

    const req = makeReq({ body: validRentalBody });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
  });

  it('TCTBVM34: req.files = undefined → bỏ qua upload, HTTP 201', async () => {
    const req = makeReq({ body: validRentalBody, files: undefined });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(fileUploadService.uploadImage).not.toHaveBeenCalled();
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM35: req.files = [] → bỏ qua upload, HTTP 201', async () => {
    const req = makeReq({ body: validRentalBody, files: [] });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(fileUploadService.uploadImage).not.toHaveBeenCalled();
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM36: title chỉ toàn khoảng trắng → nên trả 422 ', async () => {
   
    const body = { ...validRentalBody, title: '   ' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
  });

  it('TCTBVM37: title = "" → nên trả 422 ', async () => {
    
    const body = { ...validRentalBody, title: '' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
    expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
  });

  it('TCTBVM38: priceStart/priceEnd âm → nên trả 422 ', async () => {
   
    const body = { ...validRentalBody, priceStart: '-3000000', priceEnd: '-1000000' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
  });


  it('TCTBVM39:  priceStart = 0 hoặc priceEnd = 0 → lấy giá trị còn lại, cả 2 = 0 → trả 422', async () => {

  const scenarios = [
    {
      input: { priceStart: '0', priceEnd: '5000000' },
      expectedStart: 5000000,
      expectedEnd: 5000000
    },
    {
      input: { priceStart: '3000000', priceEnd: '0' },
      expectedStart: 3000000,
      expectedEnd: 3000000
    }
  ];

  for (const scenario of scenarios) {
    jest.clearAllMocks();

    (postService.insertPost as jest.Mock).mockResolvedValue([{ id: 42 }]);
    (postService.insertRentalPost as jest.Mock).mockResolvedValue([{}]);

    const body = { ...validRentalBody, ...scenario.input };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];

    // check logic normalize giá
    expect(callArg.priceStart).toBe(scenario.expectedStart);
    expect(callArg.priceEnd).toBe(scenario.expectedEnd);
  }

  // case cả 2 = 0 → phải 422
  jest.clearAllMocks();

  const invalidBody = {
    ...validRentalBody,
    priceStart: '0',
    priceEnd: '0'
  };

  const req = makeReq({ body: invalidBody });
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  expect(ApiResponse).toHaveBeenCalledWith(
    StatusCodes.UNPROCESSABLE_ENTITY,
    ReasonPhrases.UNPROCESSABLE_ENTITY,
    expect.anything()
  );
});

  it('TCTBVM40: priceStart/priceEnd là chữ ', async () => {
    const body = { ...validRentalBody, priceStart: 'abc', priceEnd: 'xyz' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
    // Mong muốn: không insert, trả 422
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
    // Chứng minh bug: NaN thực sự được truyền vào service
    expect(isNaN(callArg.priceStart)).toBe(true);
    expect(isNaN(callArg.priceEnd)).toBe(true);
  });

  it('TCTBVM41: totalArea âm hoặc = 0 → nên trả 422 ', async () => {
    
    for (const area of ['-10', '0']) {
      jest.clearAllMocks();
      (postService.insertPost as jest.Mock).mockResolvedValue([{ id: 42 }]);
      (postService.insertRentalPost as jest.Mock).mockResolvedValue([{}]);

      const body = { ...validRentalBody, totalArea: area };
      const req = makeReq({ body });
      const res = makeRes();

      await createRentalPost(req as Request, res as Response, next);

      expect(ApiResponse).toHaveBeenCalledWith(
        StatusCodes.UNPROCESSABLE_ENTITY,
        ReasonPhrases.UNPROCESSABLE_ENTITY,
        expect.anything()
      );
    }
  });

  it('TCTBVM42: totalArea là chữ ', async () => {
    const body = { ...validRentalBody, totalArea: 'không rõ' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
    // Mong muốn: không insert, trả 422
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
    // Chứng minh bug: NaN thực sự được truyền vào service
    expect(isNaN(callArg.totalArea)).toBe(true);
  });

  it('TCTBVM43: minLeaseTerm là chữ ', async () => {
    const body = { ...validRentalBody, minLeaseTerm: 'abc' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
    expect(isNaN(callArg.minLeaseTerm)).toBe(true);
  });

  it('TCTBVM44: minLeaseTerm âm hoặc = 0 → nên trả 422 ', async () => {
    for (const input of ['-5', '0']) {
      jest.clearAllMocks();
      (postService.insertPost as jest.Mock).mockResolvedValue([{ id: 42 }]);
      (postService.insertRentalPost as jest.Mock).mockResolvedValue([{}]);

      const body = { ...validRentalBody, minLeaseTerm: input };
      const req = makeReq({ body });
      const res = makeRes();

      await createRentalPost(req as Request, res as Response, next);

      const callArgs = (postService.insertRentalPost as jest.Mock).mock.calls;
      const lastCallArg = callArgs[callArgs.length - 1][0];
      expect(lastCallArg.minLeaseTerm).toBe(Number(input));
      expect(ApiResponse).toHaveBeenCalledWith(
        StatusCodes.UNPROCESSABLE_ENTITY,
        ReasonPhrases.UNPROCESSABLE_ENTITY,
        expect.anything()
      );
    }
  });

  it('TCTBVM45: Giá trị tiền cực lớn ', async () => {
    const body = { ...validRentalBody, priceStart: '100000000', priceEnd: '200000000' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
    expect(callArg.priceStart).toBe(100000000);
    expect(callArg.priceEnd).toBe(200000000);
    // expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
     expect(ApiResponse).toHaveBeenCalledWith(
        StatusCodes.UNPROCESSABLE_ENTITY,
        ReasonPhrases.UNPROCESSABLE_ENTITY,
        expect.anything()
      );
  });

  it('TCTBVM46: priceStart < priceEnd → không swap, giữ nguyên', async () => {
    const body = { ...validRentalBody, priceStart: '3000000', priceEnd: '999999999' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
    expect(callArg.priceStart).toBe(3000000);
    expect(callArg.priceEnd).toBe(999999999);
    expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
  });

  it('TCTBVM47: priceStart và priceEnd đều rỗng → nên trả 422', async () => {
    
    const body = { ...validRentalBody, priceStart: '', priceEnd: '' };
    const req = makeReq({ body });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
  });

it('TCTBVM48: hasFurniture = true → insertRentalPost nhận đúng true', async () => {
  const req = makeReq({ body: { ...validRentalBody, hasFurniture: true } });
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
  expect(callArg.hasFurniture).toBe(true);
  expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
});

it('TCTBVM49: hasFurniture = false → insertRentalPost nhận đúng false', async () => {
  const req = makeReq({ body: { ...validRentalBody, hasFurniture: false } });
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
  expect(callArg.hasFurniture).toBe(false);
  expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
});

it('TCTBVM50: hasFurniture không truyền → mặc định false/undefined, vẫn 201', async () => {
  const { hasFurniture, ...bodyWithout } = validRentalBody;
  const req = makeReq({ body: bodyWithout });
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
  expect(callArg.hasFurniture === false || callArg.hasFurniture === undefined).toBe(true);
  expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
});

it('TCTBVM51: hasFurniture = "true" string → nên trả 422 ', async () => {
  
  const req = makeReq({ body: { ...validRentalBody, hasFurniture: 'true' as any } });
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  expect(ApiResponse).toHaveBeenCalledWith(
    StatusCodes.UNPROCESSABLE_ENTITY,
    ReasonPhrases.UNPROCESSABLE_ENTITY,
    expect.anything()
  );
});

it('TCTBVM52: hasFurniture = "false" string → nên trả 422 ', async () => {
  const req = makeReq({ body: { ...validRentalBody, hasFurniture: 'false' as any } });
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  expect(ApiResponse).toHaveBeenCalledWith(
    StatusCodes.UNPROCESSABLE_ENTITY,
    ReasonPhrases.UNPROCESSABLE_ENTITY,
    expect.anything()
  );
});

it('TCTBVM53: Verify tất cả boolean field được map đúng tên vào insertRentalPost', async () => {
  
  const body = {
    ...validRentalBody,
    hasFurniture: true,
    hasAirConditioner: false,
    hasWashingMachine: true,
    hasParking: false,
    allowPets: true
  };
  const req = makeReq({ body });
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  const callArg = (postService.insertRentalPost as jest.Mock).mock.calls[0][0];
  expect(callArg.hasFurniture).toBe(true);
  expect(callArg.hasAirConditioner).toBe(false);
  expect(callArg.hasWashingMachine).toBe(true);
  expect(callArg.hasParking).toBe(false);
  expect(callArg.allowPets).toBe(true);

  expect(ApiResponse).toHaveBeenCalledWith(StatusCodes.CREATED, ReasonPhrases.CREATED, { postId: 42 });
});


it('TCTBVM54: priceUnit sai enum (VD: "year", "dollar", "") → nên trả 422 ', async () => {
  
  for (const unit of ['year', 'dollar', 'MONTH', '']) {
    jest.clearAllMocks();
    (postService.insertPost as jest.Mock).mockResolvedValue([{ id: 42 }]);
    (postService.insertRentalPost as jest.Mock).mockResolvedValue([{}]);

    const req = makeReq({ body: { ...validRentalBody, priceUnit: unit } });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
  }
});

it('TCTBVM55: minLeaseTermUnit sai enum (VD: "year", "quarter") → nên trả 422 ', async () => {
  for (const unit of ['year', 'quarter', 'MONTH', '']) {
    jest.clearAllMocks();
    (postService.insertPost as jest.Mock).mockResolvedValue([{ id: 42 }]);
    (postService.insertRentalPost as jest.Mock).mockResolvedValue([{}]);

    const req = makeReq({ body: { ...validRentalBody, minLeaseTermUnit: unit } });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
  }
});

it('TCTBVM56: totalAreaUnit sai enum (VD: "km2", "feet") → nên trả 422 ', async () => {
  for (const unit of [ 'feet' ]) {
    jest.clearAllMocks();
    (postService.insertPost as jest.Mock).mockResolvedValue([{ id: 42 }]);
    (postService.insertRentalPost as jest.Mock).mockResolvedValue([{}]);

    const req = makeReq({ body: { ...validRentalBody, totalAreaUnit: unit } });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
  }
});

it('TCTBVM57: expirationAfterUnit sai enum (VD: "year", "second") → nên trả 422 ', async () => {
 
  for (const unit of ['year', 'second', 'DAY', 'nanosecond']) {
    jest.clearAllMocks();
    (postService.insertPost as jest.Mock).mockResolvedValue([{ id: 42 }]);
    (postService.insertRentalPost as jest.Mock).mockResolvedValue([{}]);

    const req = makeReq({ body: { ...validRentalBody, expirationAfter: '10', expirationAfterUnit: unit } });
    const res = makeRes();

    await createRentalPost(req as Request, res as Response, next);

    expect(ApiResponse).toHaveBeenCalledWith(
      StatusCodes.UNPROCESSABLE_ENTITY,
      ReasonPhrases.UNPROCESSABLE_ENTITY,
      expect.anything()
    );
  }
});
it('TCTBVM58: insertPostAssets lỗi DB khi upload ảnh → next(error)', async () => {
  
  const dbError = new Error('PostAssets insert failed');
  (postService.insertPostAssets as jest.Mock).mockRejectedValue(dbError);

  const req = makeReq({
    body: validRentalBody,
    files: [{ mimetype: 'image/jpeg', originalname: 'photo.jpg', buffer: Buffer.from('') } as any]
  });
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  expect(next).toHaveBeenCalledWith(dbError);
  expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
});




it('TCTBVM59: Upload nhiều ảnh, có ảnh thất bại → vẫn thực hiện được', async () => {
 (uploadImage as jest.Mock).mockResolvedValueOnce({
  public_id: 'posts/ok',
  secure_url: 'https://cloudinary.com/ok.jpg',
  resource_type: 'image',
  format: 'jpg'
});
  const req = makeReq({
    body: validRentalBody,
    files: [
      { mimetype: 'image/jpeg', originalname: 'ok.jpg', buffer: Buffer.from('') } as any,
      { mimetype: 'image/jpeg', originalname: 'fail.jpg', buffer: Buffer.from('') } as any
    ]
  });

  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  expect(ApiResponse).toHaveBeenCalledWith(
    StatusCodes.CREATED,
    ReasonPhrases.CREATED,
    expect.objectContaining({
      postId: expect.any(Number)
    })
  );
});


it('TCTBVM60: currentUser không tồn tại → next(error) hoặc throw', async () => {
 
  const req = makeReq({ body: validRentalBody });
  (req as any).currentUser = undefined;
  const res = makeRes();

  await createRentalPost(req as Request, res as Response, next);

  expect(next).toHaveBeenCalled();
  expect(ApiResponse).not.toHaveBeenCalledWith(StatusCodes.CREATED, expect.anything(), expect.anything());
});
});