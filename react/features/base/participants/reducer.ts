/* eslint-disable lines-around-comment */
import {
    SCREEN_SHARE_REMOTE_PARTICIPANTS_UPDATED
} from '../../video-layout/actionTypes';
import ReducerRegistry from '../redux/ReducerRegistry';
import { set } from '../redux/functions';

import {
    DOMINANT_SPEAKER_CHANGED,
    OVERWRITE_PARTICIPANT_NAME,
    PARTICIPANT_ID_CHANGED,
    PARTICIPANT_JOINED,
    PARTICIPANT_LEFT,
    PARTICIPANT_UPDATED,
    PIN_PARTICIPANT,
    RAISE_HAND_UPDATED,
    SCREENSHARE_PARTICIPANT_NAME_CHANGED,
    SET_LOADABLE_AVATAR_URL
} from './actionTypes';
import { LOCAL_PARTICIPANT_DEFAULT_ID, PARTICIPANT_ROLE } from './constants';
// @ts-ignore
import { isParticipantModerator } from './functions';

/**
 * Participant object.
 *
 * @typedef {Object} Participant
 * @property {string} id - Participant ID.
 * @property {string} name - Participant name.
 * @property {string} avatar - Path to participant avatar if any.
 * @property {string} role - Participant role.
 * @property {boolean} local - If true, participant is local.
 * @property {boolean} pinned - If true, participant is currently a
 * "PINNED_ENDPOINT".
 * @property {boolean} dominantSpeaker - If this participant is the dominant
 * speaker in the (associated) conference, {@code true}; otherwise,
 * {@code false}.
 * @property {string} email - Participant email.
 */

export interface Participant {
    avatarURL?: string;
    botType?: string;
    conference?: Object;
    connectionStatus?: string;
    dominantSpeaker?: boolean;
    e2eeSupported?: boolean;
    email?: string;
    features?: {
        'screen-sharing'?: boolean;
    };
    id: string;
    isFakeParticipant?: boolean;
    isJigasi?: boolean;
    isLocalScreenShare?: boolean;
    isReplacing?: number;
    isVirtualScreenshareParticipant?: boolean;
    loadableAvatarUrl?: string;
    loadableAvatarUrlUseCORS?: boolean;
    local?: boolean;
    name?: string;
    pinned?: boolean;
    presence?: string;
    raisedHandTimestamp?: number;
    remoteControlSessionStatus?: boolean;
    role?: string;
    supportsRemoteControl?: boolean;
}

export interface LocalParticipant extends Participant {
    audioOutputDeviceId?: string;
    cameraDeviceId?: string;
    micDeviceId?: string;
    startWithAudioMuted?: boolean;
    startWithVideoMuted?: boolean;
    userSelectedMicDeviceId?: string;
    userSelectedMicDeviceLabel?: string;
}

/**
 * The participant properties which cannot be updated through
 * {@link PARTICIPANT_UPDATED}. They either identify the participant or can only
 * be modified through property-dedicated actions.
 *
 * @type {string[]}
 */
const PARTICIPANT_PROPS_TO_OMIT_WHEN_UPDATE = [

    // The following properties identify the participant:
    'conference',
    'id',
    'local',

    // The following properties can only be modified through property-dedicated
    // actions:
    'dominantSpeaker',
    'pinned'
];

const DEFAULT_STATE = {
    dominantSpeaker: undefined,
    everyoneIsModerator: false,
    fakeParticipants: new Map(),
    local: undefined,
    localScreenShare: undefined,
    overwrittenNameList: {},
    pinnedParticipant: undefined,
    raisedHandsQueue: [],
    remote: new Map(),
    sortedRemoteVirtualScreenshareParticipants: new Map(),
    sortedRemoteParticipants: new Map(),
    sortedRemoteScreenshares: new Map(),
    speakersList: new Map()
};

export interface IParticipantsState {
    dominantSpeaker?: string;
    everyoneIsModerator: boolean;
    fakeParticipants: Map<string, Participant>;
    local?: LocalParticipant;
    localScreenShare?: Participant;
    overwrittenNameList: Object;
    pinnedParticipant?: string;
    raisedHandsQueue: Array<{ id: string; raisedHandTimestamp: number;}>;
    remote: Map<string, Participant>;
    sortedRemoteParticipants: Map<string, string>;
    sortedRemoteScreenshares: Map<string, string>;
    sortedRemoteVirtualScreenshareParticipants: Map<string, string>;
    speakersList: Map<string, string>;
}

/**
 * Listen for actions which add, remove, or update the set of participants in
 * the conference.
 *
 * @param {Participant[]} state - List of participants to be modified.
 * @param {Object} action - Action object.
 * @param {string} action.type - Type of action.
 * @param {Participant} action.participant - Information about participant to be
 * added/removed/modified.
 * @returns {Participant[]}
 */
ReducerRegistry.register<IParticipantsState>('features/base/participants',
(state = DEFAULT_STATE, action): IParticipantsState => {
    switch (action.type) {
    case PARTICIPANT_ID_CHANGED: {
        const { local } = state;

        if (local) {
            if (action.newValue === 'local' && state.raisedHandsQueue.find(pid => pid.id === local.id)) {
                state.raisedHandsQueue = state.raisedHandsQueue.filter(pid => pid.id !== local.id);
            }
            state.local = {
                ...local,
                id: action.newValue
            };

            return {
                ...state
            };
        }

        return state;
    }
    case DOMINANT_SPEAKER_CHANGED: {
        const { participant } = action;
        const { id, previousSpeakers = [] } = participant;
        const { dominantSpeaker, local } = state;
        const newSpeakers = [ id, ...previousSpeakers ];
        const sortedSpeakersList: Array<Array<string>> = [];

        for (const speaker of newSpeakers) {
            if (speaker !== local?.id) {
                const remoteParticipant = state.remote.get(speaker);

                remoteParticipant
                && sortedSpeakersList.push(
                    [ speaker, _getDisplayName(state, remoteParticipant?.name) ]
                );
            }
        }

        // Keep the remote speaker list sorted alphabetically.
        sortedSpeakersList.sort((a, b) => a[1].localeCompare(b[1]));

        // Only one dominant speaker is allowed.
        if (dominantSpeaker) {
            _updateParticipantProperty(state, dominantSpeaker, 'dominantSpeaker', false);
        }

        if (_updateParticipantProperty(state, id, 'dominantSpeaker', true)) {
            return {
                ...state,
                dominantSpeaker: id, // @ts-ignore
                speakersList: new Map(sortedSpeakersList)
            };
        }

        delete state.dominantSpeaker;

        return {
            ...state
        };
    }
    case PIN_PARTICIPANT: {
        const { participant } = action;
        const { id } = participant;
        const { pinnedParticipant } = state;

        // Only one pinned participant is allowed.
        if (pinnedParticipant) {
            _updateParticipantProperty(state, pinnedParticipant, 'pinned', false);
        }

        if (id && _updateParticipantProperty(state, id, 'pinned', true)) {
            return {
                ...state,
                pinnedParticipant: id
            };
        }

        delete state.pinnedParticipant;

        return {
            ...state
        };
    }
    case SET_LOADABLE_AVATAR_URL:
    case PARTICIPANT_UPDATED: {
        const { participant } = action;
        let { id } = participant;
        const { local } = participant;

        if (!id && local) {
            id = LOCAL_PARTICIPANT_DEFAULT_ID;
        }

        let newParticipant: Participant|null = null;

        if (state.remote.has(id)) {
            newParticipant = _participant(state.remote.get(id), action);
            state.remote.set(id, newParticipant);
        } else if (id === state.local?.id) {
            newParticipant = state.local = _participant(state.local, action);
        }

        if (newParticipant) {

            // everyoneIsModerator calculation:
            const isModerator = isParticipantModerator(newParticipant);

            if (state.everyoneIsModerator && !isModerator) {
                state.everyoneIsModerator = false;
            } else if (!state.everyoneIsModerator && isModerator) {
                state.everyoneIsModerator = _isEveryoneModerator(state);
            }
        }

        return {
            ...state
        };
    }
    case SCREENSHARE_PARTICIPANT_NAME_CHANGED: {
        const { id, name } = action;

        if (state.sortedRemoteVirtualScreenshareParticipants.has(id)) {
            state.sortedRemoteVirtualScreenshareParticipants.delete(id);

            const sortedRemoteVirtualScreenshareParticipants = [ ...state.sortedRemoteVirtualScreenshareParticipants ];

            sortedRemoteVirtualScreenshareParticipants.push([ id, name ]);
            sortedRemoteVirtualScreenshareParticipants.sort((a, b) => a[1].localeCompare(b[1]));

            state.sortedRemoteVirtualScreenshareParticipants = new Map(sortedRemoteVirtualScreenshareParticipants);
        }

        return { ...state };
    }

    case PARTICIPANT_JOINED: {
        const participant = _participantJoined(action);
        const {
            id,
            isFakeParticipant,
            isLocalScreenShare,
            isVirtualScreenshareParticipant,
            name,
            pinned
        } = participant;
        const { pinnedParticipant, dominantSpeaker } = state;

        if (pinned) {
            if (pinnedParticipant) {
                _updateParticipantProperty(state, pinnedParticipant, 'pinned', false);
            }

            state.pinnedParticipant = id;
        }

        if (participant.dominantSpeaker) {
            if (dominantSpeaker) {
                _updateParticipantProperty(state, dominantSpeaker, 'dominantSpeaker', false);
            }
            state.dominantSpeaker = id;
        }

        const isModerator = isParticipantModerator(participant);
        const { local, remote } = state;

        if (state.everyoneIsModerator && !isModerator) {
            state.everyoneIsModerator = false;
        } else if (!local && remote.size === 0 && isModerator) {
            state.everyoneIsModerator = true;
        }

        if (participant.local) {
            return {
                ...state,
                local: participant
            };
        }

        if (isLocalScreenShare) {
            return {
                ...state,
                localScreenShare: participant
            };
        }

        state.remote.set(id, participant);

        // Insert the new participant.
        const displayName = _getDisplayName(state, name);
        const sortedRemoteParticipants = Array.from(state.sortedRemoteParticipants);

        sortedRemoteParticipants.push([ id, displayName ]);
        sortedRemoteParticipants.sort((a, b) => a[1].localeCompare(b[1]));

        // The sort order of participants is preserved since Map remembers the original insertion order of the keys.
        state.sortedRemoteParticipants = new Map(sortedRemoteParticipants);

        if (isVirtualScreenshareParticipant) {
            const sortedRemoteVirtualScreenshareParticipants = [ ...state.sortedRemoteVirtualScreenshareParticipants ];

            sortedRemoteVirtualScreenshareParticipants.push([ id, name ?? '' ]);
            sortedRemoteVirtualScreenshareParticipants.sort((a, b) => a[1].localeCompare(b[1]));

            state.sortedRemoteVirtualScreenshareParticipants = new Map(sortedRemoteVirtualScreenshareParticipants);
        }
        if (isFakeParticipant) {
            state.fakeParticipants.set(id, participant);
        }

        return { ...state };

    }
    case PARTICIPANT_LEFT: {
        // XXX A remote participant is uniquely identified by their id in a
        // specific JitsiConference instance. The local participant is uniquely
        // identified by the very fact that there is only one local participant
        // (and the fact that the local participant "joins" at the beginning of
        // the app and "leaves" at the end of the app).
        const { conference, id } = action.participant;
        const {
            fakeParticipants,
            sortedRemoteVirtualScreenshareParticipants,
            remote,
            local,
            localScreenShare,
            dominantSpeaker,
            pinnedParticipant
        } = state;
        let oldParticipant = remote.get(id);

        if (oldParticipant && oldParticipant.conference === conference) {
            remote.delete(id);
        } else if (local?.id === id) {
            oldParticipant = state.local;
            delete state.local;
        } else if (localScreenShare?.id === id) {
            oldParticipant = state.local;
            delete state.localScreenShare;
        } else {
            // no participant found
            return state;
        }

        state.sortedRemoteParticipants.delete(id);
        state.raisedHandsQueue = state.raisedHandsQueue.filter(pid => pid.id !== id);

        if (!state.everyoneIsModerator && !isParticipantModerator(oldParticipant)) {
            state.everyoneIsModerator = _isEveryoneModerator(state);
        }

        if (dominantSpeaker === id) {
            state.dominantSpeaker = undefined;
        }

        // Remove the participant from the list of speakers.
        state.speakersList.has(id) && state.speakersList.delete(id);

        if (pinnedParticipant === id) {
            state.pinnedParticipant = undefined;
        }

        if (fakeParticipants.has(id)) {
            fakeParticipants.delete(id);
        }

        if (sortedRemoteVirtualScreenshareParticipants.has(id)) {
            sortedRemoteVirtualScreenshareParticipants.delete(id);
            state.sortedRemoteVirtualScreenshareParticipants = new Map(sortedRemoteVirtualScreenshareParticipants);
        }

        return { ...state };
    }
    case RAISE_HAND_UPDATED: {
        return {
            ...state,
            raisedHandsQueue: action.queue
        };
    }
    case SCREEN_SHARE_REMOTE_PARTICIPANTS_UPDATED: {
        const { participantIds } = action;
        const sortedSharesList = [];

        for (const participant of participantIds) {
            const remoteParticipant = state.remote.get(participant);

            if (remoteParticipant) {
                const displayName
                    = _getDisplayName(state, remoteParticipant.name);

                sortedSharesList.push([ participant, displayName ]);
            }
        }

        // Keep the remote screen share list sorted alphabetically.
        sortedSharesList.length && sortedSharesList.sort((a, b) => a[1].localeCompare(b[1]));
        // @ts-ignore
        state.sortedRemoteScreenshares = new Map(sortedSharesList);

        return { ...state };
    }
    case OVERWRITE_PARTICIPANT_NAME: {
        const { id, name } = action;

        return {
            ...state,
            overwrittenNameList: {
                ...state.overwrittenNameList,
                [id]: name
            }
        };
    }
    }

    return state;
});

/**
 * Returns the participant's display name, default string if display name is not set on the participant.
 *
 * @param {Object} state - The local participant redux state.
 * @param {string} name - The display name of the participant.
 * @returns {string}
 */
function _getDisplayName(state: Object, name?: string): string {
    // @ts-ignore
    const config = state['features/base/config'];

    return name ?? (config?.defaultRemoteDisplayName || 'Fellow Jitster');
}

/**
 * Loops through the participants in the state in order to check if all participants are moderators.
 *
 * @param {Object} state - The local participant redux state.
 * @returns {boolean}
 */
function _isEveryoneModerator(state: IParticipantsState) {
    if (isParticipantModerator(state.local)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [ k, p ] of state.remote) {
            if (!isParticipantModerator(p)) {
                return false;
            }
        }

        return true;
    }

    return false;
}

/**
 * Reducer function for a single participant.
 *
 * @param {Participant|undefined} state - Participant to be modified.
 * @param {Object} action - Action object.
 * @param {string} action.type - Type of action.
 * @param {Participant} action.participant - Information about participant to be
 * added/modified.
 * @param {JitsiConference} action.conference - Conference instance.
 * @private
 * @returns {Participant}
 */
function _participant(state: Participant|LocalParticipant = {
    id: '',
    name: '' }, action: any): Participant|LocalParticipant {
    switch (action.type) {
    case SET_LOADABLE_AVATAR_URL:
    case PARTICIPANT_UPDATED: {
        const { participant } = action; // eslint-disable-line no-shadow

        const newState = { ...state };

        for (const key in participant) {
            if (participant.hasOwnProperty(key)
                    && PARTICIPANT_PROPS_TO_OMIT_WHEN_UPDATE.indexOf(key)
                        === -1) {
                // @ts-ignore
                newState[key] = participant[key];
            }
        }

        return newState;
    }
    }

    return state;
}

/**
 * Reduces a specific redux action of type {@link PARTICIPANT_JOINED} in the
 * feature base/participants.
 *
 * @param {Action} action - The redux action of type {@code PARTICIPANT_JOINED}
 * to reduce.
 * @private
 * @returns {Object} The new participant derived from the payload of the
 * specified {@code action} to be added into the redux state of the feature
 * base/participants after the reduction of the specified
 * {@code action}.
 */
function _participantJoined({ participant }: {participant: Participant}) {
    const {
        avatarURL,
        botType,
        connectionStatus,
        dominantSpeaker,
        email,
        isFakeParticipant,
        isVirtualScreenshareParticipant,
        isLocalScreenShare,
        isReplacing,
        isJigasi,
        loadableAvatarUrl,
        local,
        name,
        pinned,
        presence,
        role
    } = participant;
    let { conference, id } = participant;

    if (local) {
        // conference
        //
        // XXX The local participant is not identified in association with a
        // JitsiConference because it is identified by the very fact that it is
        // the local participant.
        conference = undefined;

        // id
        id || (id = LOCAL_PARTICIPANT_DEFAULT_ID);
    }

    return {
        avatarURL,
        botType,
        conference,
        connectionStatus,
        dominantSpeaker: dominantSpeaker || false,
        email,
        id,
        isFakeParticipant,
        isVirtualScreenshareParticipant,
        isLocalScreenShare,
        isReplacing,
        isJigasi,
        loadableAvatarUrl,
        local: local || false,
        name,
        pinned: pinned || false,
        presence,
        role: role || PARTICIPANT_ROLE.NONE
    };
}

/**
 * Updates a specific property for a participant.
 *
 * @param {State} state - The redux state.
 * @param {string} id - The ID of the participant.
 * @param {string} property - The property to update.
 * @param {*} value - The new value.
 * @returns {boolean} - True if a participant was updated and false otherwise.
 */
function _updateParticipantProperty(state: IParticipantsState, id: string, property: string, value: boolean) {
    const { remote, local, localScreenShare } = state;

    if (remote.has(id)) {
        remote.set(id, set(remote.get(id) ?? {
            id: '',
            name: ''
        }, property as keyof Participant, value));

        return true;
    } else if (local?.id === id || local?.id === 'local') {
        // The local participant's ID can chance from something to "local" when
        // not in a conference.
        state.local = set(local, property as keyof LocalParticipant, value);

        return true;

    } else if (localScreenShare?.id === id) {
        state.localScreenShare = set(localScreenShare, property as keyof Participant, value);

        return true;
    }

    return false;
}
