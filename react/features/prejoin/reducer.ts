import PersistenceRegistry from '../base/redux/PersistenceRegistry';
import ReducerRegistry from '../base/redux/ReducerRegistry';

import {
    PREJOIN_JOINING_IN_PROGRESS,
    SET_DEVICE_STATUS,
    SET_DIALOUT_COUNTRY,
    SET_DIALOUT_NUMBER,
    SET_DIALOUT_STATUS,
    SET_JOIN_BY_PHONE_DIALOG_VISIBLITY,
    SET_PRECALL_TEST_RESULTS,
    SET_PREJOIN_DEVICE_ERRORS,
    SET_PREJOIN_DISPLAY_NAME_REQUIRED,
    SET_PREJOIN_PAGE_VISIBILITY,
    SET_SKIP_PREJOIN_RELOAD
} from './actionTypes';

const DEFAULT_STATE = {
    country: '',
    deviceStatusText: 'prejoin.configuringDevices',
    deviceStatusType: 'ok',
    dialOutCountry: {
        name: 'United States',
        dialCode: '1',
        code: 'us'
    },
    dialOutNumber: '',
    dialOutStatus: 'prejoin.dialing',
    isDisplayNameRequired: false,
    name: '',
    rawError: '',
    showPrejoin: true,
    skipPrejoinOnReload: false,
    showJoinByPhoneDialog: false
};

export interface IPrejoinState {
    country: string;
    deviceStatusText: string;
    deviceStatusType: string;
    dialOutCountry: {
        code: string;
        dialCode: string;
        name: string;
    };
    dialOutNumber: string;
    dialOutStatus: string;
    isDisplayNameRequired: boolean;
    joiningInProgress?: boolean;
    name: string;
    precallTestResults?: Object;
    rawError: string;
    showJoinByPhoneDialog: boolean;
    showPrejoin: boolean;
    skipPrejoinOnReload: boolean;
}

/**
 * Sets up the persistence of the feature {@code prejoin}.
 */
PersistenceRegistry.register('features/prejoin', {
    skipPrejoinOnReload: true
}, DEFAULT_STATE);

/**
 * Listen for actions that mutate the prejoin state.
 */
ReducerRegistry.register<IPrejoinState>(
    'features/prejoin', (state = DEFAULT_STATE, action): IPrejoinState => {
        switch (action.type) {
        case PREJOIN_JOINING_IN_PROGRESS:
            return {
                ...state,
                joiningInProgress: action.value
            };
        case SET_SKIP_PREJOIN_RELOAD: {
            return {
                ...state,
                skipPrejoinOnReload: action.value
            };
        }

        case SET_PRECALL_TEST_RESULTS:
            return {
                ...state,
                precallTestResults: action.value
            };

        case SET_PREJOIN_PAGE_VISIBILITY:
            return {
                ...state,
                showPrejoin: action.value
            };

        case SET_PREJOIN_DEVICE_ERRORS: {
            const status = getStatusFromErrors(action.value);

            return {
                ...state,
                ...status
            };
        }

        case SET_DEVICE_STATUS: {
            const { deviceStatusType, deviceStatusText } = action.value;

            return {
                ...state,
                deviceStatusText,
                deviceStatusType
            };
        }

        case SET_DIALOUT_NUMBER: {
            return {
                ...state,
                dialOutNumber: action.value
            };
        }

        case SET_DIALOUT_COUNTRY: {
            return {
                ...state,
                dialOutCountry: action.value
            };
        }

        case SET_DIALOUT_STATUS: {
            return {
                ...state,
                dialOutStatus: action.value
            };
        }

        case SET_JOIN_BY_PHONE_DIALOG_VISIBLITY: {
            return {
                ...state,
                showJoinByPhoneDialog: action.value
            };
        }

        case SET_PREJOIN_DISPLAY_NAME_REQUIRED: {
            return {
                ...state,
                isDisplayNameRequired: true
            };
        }

        default:
            return state;
        }
    }
);

/**
 * Returns a suitable error object based on the track errors.
 *
 * @param {Object} errors - The errors got while creating local tracks.
 * @returns {Object}
 */
function getStatusFromErrors(errors: {
    audioAndVideoError?: {message: string},
    audioOnlyError?: { message: string },
    videoOnlyError?: Object }
) {
    const { audioOnlyError, videoOnlyError, audioAndVideoError } = errors;

    if (audioAndVideoError) {
        if (audioOnlyError) {
            if (videoOnlyError) {
                return {
                    deviceStatusType: 'warning',
                    deviceStatusText: 'prejoin.audioAndVideoError',
                    rawError: audioAndVideoError.message
                };
            }

            return {
                deviceStatusType: 'warning',
                deviceStatusText: 'prejoin.audioOnlyError',
                rawError: audioOnlyError.message
            };
        }

        return {
            deviceStatusType: 'warning',
            deviceStatusText: 'prejoin.videoOnlyError',
            rawError: audioAndVideoError.message
        };
    }

    return {
        deviceStatusType: 'ok',
        deviceStatusText: 'prejoin.lookGood',
        rawError: ''
    };
}
