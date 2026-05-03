import cloudinary from '@/configs/cloudinary.config';
import { deleteManyResources } from '../fileUpload.service';
import { StatusCodes } from 'http-status-codes';

// Mock Cloudinary
jest.mock('@/configs/cloudinary.config', () => ({
    api: {
        delete_resources: jest.fn(),
    },
}));

describe('Unit Test: deleteManyResources - Image Focus', () => {
    const mockImageIds = ['posts/room_01', 'posts/room_02', 'posts/room_03'];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('TC_UNIT_QLBV_DELETEMANY_1: Xóa danh sách nhiều ảnh cùng lúc', async () => {
        const mockCloudinaryResponse = {
            deleted: {
                'posts/room_01': 'deleted',
                'posts/room_02': 'deleted',
                'posts/room_03': 'deleted'
            },
            partial: false
        };

        (cloudinary.api.delete_resources as jest.Mock).mockResolvedValue(mockCloudinaryResponse);

        const result = await deleteManyResources(mockImageIds, 'image');

        // Kiểm tra API được gọi với đúng loại là 'image'
        expect(cloudinary.api.delete_resources).toHaveBeenCalledWith(
            mockImageIds,
            expect.objectContaining({ resource_type: 'image' })
        );

        // Kiểm tra số lượng ảnh báo về đã xóa
        expect(Object.keys(result.deleted).length).toBe(3);
    });

    test('TC_UNIT_QLBV_DELETEMANY_2: Xóa một ảnh duy nhất nhưng truyền vào dưới dạng mảng', async () => {
        const singleId = ['posts/single_img'];
        (cloudinary.api.delete_resources as jest.Mock).mockResolvedValue({
            deleted: { 'posts/single_img': 'deleted' }
        });

        await deleteManyResources(singleId, 'image');

        expect(cloudinary.api.delete_resources).toHaveBeenCalledWith(
            ['posts/single_img'],
            { resource_type: 'image' }
        );
    });

    test('TC_UNIT_QLBV_DELETEMANY_3: Xử lý khi có ảnh không tồn tại trên Cloudinary (not_found)', async () => {
        // Cloudinary không ném lỗi nếu ID không tồn tại, nó trả về trạng thái 'not_found'
        const mockMixResponse = {
            deleted: {
                'posts/exists': 'deleted',
                'posts/not_exists': 'not_found'
            }
        };

        (cloudinary.api.delete_resources as jest.Mock).mockResolvedValue(mockMixResponse);

        const result = await deleteManyResources(['posts/exists', 'posts/not_exists'], 'image');

        // Kiểm tra kết quả vẫn trả về bình thường, không gây crash hệ thống
        expect(result.deleted['posts/not_exists']).toBe('not_found');
    });

    test('TC_UNIT_QLBV_DELETEMANY_4: Lỗi kết nối hoặc sai thông tin API Cloudinary', async () => {
        // Giả lập lỗi hệ thống (vd: sai API Secret)
        const systemError = {
            error: { message: 'Must provide api_key' }
        };

        (cloudinary.api.delete_resources as jest.Mock).mockRejectedValue(systemError);

        await expect(deleteManyResources(mockImageIds, 'image'))
            .rejects
            .toEqual(systemError);
    });
    test('TC_UNIT_QLBV_DELETEMANY_5: Xóa hàng loạt video thành công', async () => {
        (cloudinary.api.delete_resources as jest.Mock).mockResolvedValue({ deleted: { 'vid1': 'deleted' } });

        await deleteManyResources(['vid1'], 'video');

        expect(cloudinary.api.delete_resources).toHaveBeenCalledWith(
            ['vid1'],
            { resource_type: 'video' }
        );
    });
});