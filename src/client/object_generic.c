/**
 * @license
 * Copyright (c) 2017 CANDY LINE INC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "liblwm2m.h"
#include "lwm2mclient.h"
#include "base64.h"
#include "commandline.h"

#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <ctype.h>
#include <sys/select.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/stat.h>
#include <errno.h>
#include <signal.h>
#include <inttypes.h>

#define MAX_MESSAGE_SIZE 65536
#define MAX_RESOURCES 65536

typedef struct
{
    uint16_t objectId;
    uint8_t * response;
    size_t responseLen;
} parent_context_t;

static uint8_t * find_base64_from_response(char * cmd, uint8_t * resp)
{
    uint16_t i = 0;
    uint16_t size = 5 + strlen(cmd) + 1; // without \0
    // /resp:{command}:{base64 payload}\r\n
    uint8_t * expected = lwm2m_malloc(size);
    uint8_t * ptr = expected;
    strcpy((char *)ptr, "/resp:");
    ptr += 6; // strlen("/resp:")
    strcpy((char *)ptr, cmd);
    ptr += strlen(cmd);
    *ptr = ':';
    while ((i < size) && (*expected == *resp)) {
        ++expected;
        ++resp;
        ++i;
    }
    if (i != size) {
        return NULL;
    }
    return resp + 1; // next to ':'
}

static uint8_t request_command(parent_context_t * context,
                               char * cmd,
                               uint8_t * payloadRaw,
                               size_t payloadRawLen)
{
    fd_set readfds;
    struct timeval tv;
    size_t payloadLen;
    uint8_t * payload;
    int recvResult;
    uint8_t buffer[MAX_MESSAGE_SIZE];
    size_t recvLen;

    // parent process re timeout
    tv.tv_sec = 1;       // 1sec
    tv.tv_usec = 500000; // 500ms

    // setup FD
    FD_ZERO(&readfds);
    FD_SET(STDIN_FILENO, &readfds);

    // encode payload
    payload = util_base64_encode(
        (const uint8_t *)payloadRaw, payloadRawLen, &payloadLen);
    if (NULL == payload) {
        fprintf(stderr, "error:COAP_400_BAD_REQUEST=>[%s]\r\n", cmd);
        return COAP_400_BAD_REQUEST;
    }

    // send command
    fprintf(stdout, "/%s:%s\r\n", cmd, payload);
    fflush(stdout);

    // release
    lwm2m_free(payload);
    payload = NULL;

    // wait for response
    recvResult = select(FD_SETSIZE, &readfds, NULL, NULL, &tv);
    if (recvResult < 1 || !FD_ISSET(STDIN_FILENO, &readfds)) {
        fprintf(stderr, "error:COAP_501_NOT_IMPLEMENTED=>[%s]\r\n", cmd);
        return COAP_501_NOT_IMPLEMENTED;
    }

    // read recv data
    recvLen = read(STDIN_FILENO, buffer, MAX_MESSAGE_SIZE - 1);
    if (recvLen < 1) {
        fprintf(stderr, "error:COAP_500_INTERNAL_SERVER_ERROR=>[%s], empty response\r\n", cmd);
        return COAP_500_INTERNAL_SERVER_ERROR;
    }
    buffer[recvLen] = '\0';
    payload = find_base64_from_response(cmd, buffer);
    if (NULL == payload) {
        fprintf(stderr, "error:COAP_500_INTERNAL_SERVER_ERROR=>[%s], resp=>[%s]\r\n", cmd, buffer);
        return COAP_500_INTERNAL_SERVER_ERROR;
    }
    payloadLen = strlen((const char *)payload);

    // decoded result
    fprintf(stderr, "done:cmd=>[%s], resp=>[%s], base64=>[%s], base64Len=>[%zu]\r\n", cmd, buffer, payload, payloadLen);
    context->response = util_base64_decode(payload, payloadLen, &context->responseLen);
    if (context->responseLen == 0) {
        fprintf(stderr, "error:COAP_500_INTERNAL_SERVER_ERROR=>[%s], resp=>[%s]\r\n", cmd, buffer);
        return COAP_500_INTERNAL_SERVER_ERROR;
    }

    return COAP_NO_ERROR;
}

static parent_context_t * setup_parent_context(uint8_t objectId)
{
    parent_context_t * context = (parent_context_t *)lwm2m_malloc(sizeof(parent_context_t));
    // TODO
    context->objectId = objectId;
    return context;
}

static void response_free(parent_context_t * context)
{
    if (context->response) {
        lwm2m_free(context->response);
        context->response = NULL;
    }
    context->responseLen = 0;
}

static void lwm2m_data_cp(lwm2m_data_t * dataP,
                          uint8_t * data,
                          uint16_t len)
{
    char * buf;
    switch(dataP->type) {
        case LWM2M_TYPE_STRING:
            lwm2m_data_encode_nstring((const char *)data, len, dataP);
            break;
        case LWM2M_TYPE_OPAQUE:
            lwm2m_data_encode_opaque(data, len, dataP);
            break;
        case LWM2M_TYPE_INTEGER:
            buf = lwm2m_malloc(len + 1);
            memcpy(buf, data, len);
            buf[len] = '\0';
            lwm2m_data_encode_int(strtoll(buf, NULL, 10), dataP);
            lwm2m_free(buf);
            break;
        case LWM2M_TYPE_FLOAT:
            buf = lwm2m_malloc(len + 1);
            memcpy(buf, data, len);
            buf[len] = '\0';
            lwm2m_data_encode_float(strtod(buf, NULL), dataP);
            lwm2m_free(buf);
            break;
        case LWM2M_TYPE_BOOLEAN:
            lwm2m_data_encode_bool((data[0] == 1), dataP);
            break;
        case LWM2M_TYPE_OBJECT_LINK:
            lwm2m_data_encode_objlink(data[0] + (((uint16_t)data[1]) << 8),
                                      data[2] + (((uint16_t)data[3]) << 8),
                                      dataP);
            break;
        case LWM2M_TYPE_MULTIPLE_RESOURCE:
            {
                uint16_t i = 0;
                uint16_t idx = 2;
                uint16_t childSize;
                uint16_t count = data[0] + (((uint16_t)data[1]) << 8);
                lwm2m_data_t * children = lwm2m_data_new(count);
                for (; i < count; i++) {
                    children[i].id = data[idx++];
                    children[i].id += (((uint16_t)data[idx++]) << 8);
                    children[i].type = data[idx++];
                    childSize = data[idx++];
                    childSize += (((uint16_t)data[idx++]) << 8);
                    lwm2m_data_cp(&children[i], &data[idx], childSize);
                    idx += childSize;
                }
                lwm2m_data_encode_instances(children, count, dataP);
            }
            break;
        default:
            break;
    }
}

static uint8_t prv_generic_read(uint16_t instanceId,
                                int * numDataP,
                                lwm2m_data_t ** dataArrayP,
                                lwm2m_object_t * objectP)
{
    if (*numDataP > MAX_RESOURCES) {
        return COAP_400_BAD_REQUEST;
    }

    uint16_t i = 0;
    uint16_t j = 0;
    uint8_t messageId = 0x01;
    uint8_t result;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    size_t payloadRawLen = 8 + *numDataP * 2;
    uint8_t * payloadRaw = lwm2m_malloc(payloadRawLen);
    payloadRaw[i++] = 0x01;                     // Data Type: 0x01 (Request), 0x02 (Response)
    payloadRaw[i++] = messageId;                // Message Id associated with Data Type
    payloadRaw[i++] = context->objectId & 0xff; // ObjectID LSB
    payloadRaw[i++] = context->objectId >> 8;   // ObjectID MSB
    payloadRaw[i++] = instanceId & 0xff;        // InstanceId LSB
    payloadRaw[i++] = instanceId >> 8;          // InstanceId MSB
    payloadRaw[i++] = *numDataP & 0xff;         // # of required data LSB (0x0000=ALL)
    payloadRaw[i++] = *numDataP >> 8;           // # of required data MSB
    for(; i < payloadRawLen;)
    {
        uint16_t id = (*dataArrayP)[j++].id;
        payloadRaw[i++] = id & 0xff; // ResourceId LSB
        payloadRaw[i++] = id >> 8;   // ResourceId MSB
    }

    fprintf(stderr, "prv_generic_read:objectId=>%hu, instanceId=>%hu, numDataP=>%d\r\n",
        context->objectId, instanceId, *numDataP);
    result = request_command(context, "read", payloadRaw, payloadRawLen);
    lwm2m_free(payloadRaw);

    /*
     * Response Data Format (result = COAP_NO_ERROR)
     * 02 ... Data Type: 0x01 (Request), 0x02 (Response)
     * 00 ... Message Id associated with Data Type
     * 45 ... Result Status Code e.g. COAP_205_CONTENT
     * 00 ... ObjectID LSB
     * 00 ... ObjectID MSB
     * 00 ... InstanceId LSB
     * 00 ... InstanceId MSB
     * 00 ... # of resources LSB
     * 00 ... # of resources MSB
     * 00 ... ResouceId LSB  <============= First ResourceId LSB (index:9)
     * 00 ... ResouceId MSB
     * 00 ... Resouce Data Type
     * 00 ... Length of resource data LSB
     * 00 ... Length of resource data MSB
     * 00 ... Resource Data
     * 00 ... ResouceId LSB  <============= Second ResourceId LSB
     * 00 ... ResouceId MSB
     * 00 ... Resouce Data Type
     * 00 ... Length of resource data LSB
     * 00 ... Length of resource data MSB
     * 00 ... Resource Data
     * ..
     */
    uint16_t idx = 9; // First ResouceId LSB index
    uint16_t len; // Resource data length
    uint8_t * response = context->response;
    if (COAP_NO_ERROR == result && response[0] == 0x02 && messageId == response[1]) {
        result = response[2];
        if (*numDataP == 0) {
            *numDataP = response[7] + (((uint16_t)response[8]) << 8);
            *dataArrayP = lwm2m_data_new(*numDataP);
            if (*dataArrayP == NULL) return COAP_500_INTERNAL_SERVER_ERROR;
            fprintf(stderr, "prv_generic_read:(lwm2m_data_new):*numDataP=>%d\r\n",
                *numDataP);
        }
        for (i = 0; i < *numDataP; i++)
        {
            (*dataArrayP)[i].id = response[idx++];
            (*dataArrayP)[i].id += (((uint16_t)response[idx++]) << 8);
            (*dataArrayP)[i].type = response[idx++];
            len = response[idx++];
            len += (((uint16_t)response[idx++]) << 8);
            lwm2m_data_cp(&(*dataArrayP)[i], &response[idx], len);
            idx += len;
        }
    } else {
        result = COAP_400_BAD_REQUEST;
    }
    response_free(context);
    fprintf(stderr, "prv_generic_read:result=>%u\r\n", result);
    return result;
}

static uint16_t lwm2m_get_payload_size(int numData,
                                       lwm2m_data_t * dataArray)
{
    uint16_t i = 0;
    uint16_t len = 0;
    for (i = 0; i < numData; i++)
    {
        len += 5; // ResourceId (16bit) + Resouce Data Type (8bit) + Length of resource data (16bit)
        switch (dataArray[i].type) {
            case LWM2M_TYPE_STRING:
            case LWM2M_TYPE_OPAQUE:
                len += dataArray[i].value.asBuffer.length;
                break;
            case LWM2M_TYPE_INTEGER:
                len += snprintf(NULL, 0, "%" PRIu64, dataArray[i].value.asInteger);
                break;
            case LWM2M_TYPE_FLOAT:
                len += snprintf(NULL, 0, "%f", dataArray[i].value.asFloat);
                break;
            case LWM2M_TYPE_BOOLEAN:
                len += 1;
                break;
            case LWM2M_TYPE_OBJECT_LINK:
                len += sizeof(uint16_t) * 2;
                break;
            case LWM2M_TYPE_MULTIPLE_RESOURCE:
                ++len; // # of resources LSB
                ++len; // # of resources MSB
                len += lwm2m_get_payload_size(
                    dataArray[i].value.asChildren.count,
                    dataArray[i].value.asChildren.array);
                break;
            default:
                break;
        }
    }
    return len;
}

static size_t lwm2m_write_payload(uint16_t * i,
                                  uint8_t * payloadRaw,
                                  int numData,
                                  lwm2m_data_t * dataArray)
{
    size_t len;
    uint16_t j;

    for (j = 0; j < numData; j++)
    {
        uint16_t id = dataArray[j].id;
        uint16_t begin = *i;
        payloadRaw[(*i)++] = id & 0xff;  // ResourceId LSB
        payloadRaw[(*i)++] = id >> 8;    // ResourceId MSB
        payloadRaw[(*i)++] = dataArray[j].type; // Resouce Data Type
        payloadRaw[(*i)++] = 0x00;       // Length of resource data LSB
        payloadRaw[(*i)++] = 0x00;       // Length of resource data MSB
        len = 0;
        switch (dataArray[j].type) {
            case LWM2M_TYPE_STRING:
            case LWM2M_TYPE_OPAQUE:
                len += dataArray[j].value.asBuffer.length;
                memcpy(
                    &payloadRaw[*i],
                    dataArray[j].value.asBuffer.buffer,
                    dataArray[j].value.asBuffer.length);
                break;
            case LWM2M_TYPE_INTEGER:
                len += sprintf((char *)&payloadRaw[*i], "%" PRIu64, dataArray[j].value.asInteger);
                break;
            case LWM2M_TYPE_FLOAT:
                len += sprintf((char *)&payloadRaw[*i], "%f", dataArray[j].value.asFloat);
                break;
            case LWM2M_TYPE_BOOLEAN:
                len += 1;
                payloadRaw[*i] = dataArray[j].value.asBoolean;
                break;
            case LWM2M_TYPE_OBJECT_LINK:
                len += sizeof(uint16_t) * 2;
                payloadRaw[*i + 0] = dataArray[j].value.asObjLink.objectId & 0xff; // objectId LSB
                payloadRaw[*i + 1] = dataArray[j].value.asObjLink.objectId >> 8;   // objectId MSB
                payloadRaw[*i + 2] = dataArray[j].value.asObjLink.objectInstanceId & 0xff; // objectInstanceId LSB
                payloadRaw[*i + 3] = dataArray[j].value.asObjLink.objectInstanceId >> 8;   // objectInstanceId MSB
                break;
            case LWM2M_TYPE_MULTIPLE_RESOURCE:
                len += lwm2m_write_payload(
                    i,
                    &payloadRaw[*i],
                    dataArray[j].value.asChildren.count,
                    dataArray[j].value.asChildren.array);
                break;
            default:
                break;
        }
        *i += len;
        payloadRaw[begin + 3] = len & 0xff; // Length of resource data LSB
        payloadRaw[begin + 4] = len >> 8;   // Length of resource data MSB
    }
    return len;
}

static uint8_t prv_generic_write(uint16_t instanceId,
                                 int numData,
                                 lwm2m_data_t * dataArray,
                                 lwm2m_object_t * objectP)
{
    uint16_t i = 0;
    uint8_t messageId = 0x01;
    uint8_t result;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    size_t payloadRawLen = 8 + lwm2m_get_payload_size(numData, dataArray);
    uint8_t * payloadRaw = lwm2m_malloc(payloadRawLen);
    payloadRaw[i++] = 0x01;                     // Data Type: 0x01 (Request), 0x02 (Response)
    payloadRaw[i++] = messageId;                // Message Id associated with Data Type
    payloadRaw[i++] = context->objectId & 0xff; // ObjectID LSB
    payloadRaw[i++] = context->objectId >> 8;   // ObjectID MSB
    payloadRaw[i++] = instanceId & 0xff;        // InstanceId LSB
    payloadRaw[i++] = instanceId >> 8;          // InstanceId MSB
    payloadRaw[i++] = numData & 0xff;           // # of required data LSB (0x0000=ALL)
    payloadRaw[i++] = numData >> 8;             // # of required data MSB
    lwm2m_write_payload(&i, payloadRaw, numData, dataArray);

    fprintf(stderr, "prv_generic_write:objectId=>%hu, instanceId=>%hu, numData=>%d\r\n",
      context->objectId, instanceId, numData);
    result = request_command(context, "write", payloadRaw, payloadRawLen);
    lwm2m_free(payloadRaw);

    /*
    * Response Data Format (result = COAP_NO_ERROR)
    * 02 ... Data Type: 0x01 (Request), 0x02 (Response)
    * 00 ... Message Id associated with Data Type
    * 45 ... Result Status Code e.g. COAP_205_CONTENT
    * 00 ... ObjectID LSB
    * 00 ... ObjectID MSB
    * 00 ... InstanceId LSB
    * 00 ... InstanceId MSB
    * 00 ... always 00
    * 00 ... always 00
    */
    uint8_t * response = context->response;
    if (COAP_NO_ERROR == result && response[0] == 0x02 && messageId == response[1]) {
        result = response[2];
    } else {
        result = COAP_400_BAD_REQUEST;
    }
    response_free(context);
    fprintf(stderr, "prv_generic_write:result=>%u\r\n", result);
    return result;
}

static uint8_t prv_generic_execute(uint16_t instanceId,
                                   uint16_t resourceId,
                                   uint8_t * buffer,
                                   int length,
                                   lwm2m_object_t * objectP)
{
    uint8_t result = COAP_501_NOT_IMPLEMENTED;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

static uint8_t prv_generic_discover(uint16_t instanceId,
                                    int * numDataP,
                                    lwm2m_data_t ** dataArrayP,
                                    lwm2m_object_t * objectP)
{
    uint8_t result = COAP_501_NOT_IMPLEMENTED;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

static uint8_t prv_generic_create(uint16_t instanceId,
                                  int numData,
                                  lwm2m_data_t * dataArray,
                                  lwm2m_object_t * objectP)
{
    uint8_t result = COAP_501_NOT_IMPLEMENTED;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

static uint8_t prv_generic_delete(uint16_t instanceId,
                                  lwm2m_object_t * objectP)
{
    uint8_t result = COAP_501_NOT_IMPLEMENTED;
    parent_context_t * context = (parent_context_t *)objectP->userData;
    // TODO
    return result;
}

lwm2m_object_t * get_object(uint8_t objectId)
{
    lwm2m_object_t * genericObj = (lwm2m_object_t *)lwm2m_malloc(sizeof(lwm2m_object_t));
    if (NULL == genericObj)
    {
        return NULL;
    }
    memset(genericObj, 0, sizeof(lwm2m_object_t));
    genericObj->objID = objectId;

    parent_context_t * context = setup_parent_context(objectId);
    if (NULL != context)
    {
        genericObj->userData = context;
    }
    else
    {
        free_object(genericObj);
        return NULL;
    }

    // TODO Setup Instances
    genericObj->instanceList = (lwm2m_list_t *)lwm2m_malloc(sizeof(lwm2m_list_t));
    if (NULL != genericObj->instanceList)
    {
        memset(genericObj->instanceList, 0, sizeof(lwm2m_list_t));
    }
    else
    {
        free_object(genericObj);
        return NULL;
    }

    genericObj->readFunc     = prv_generic_read;
    genericObj->discoverFunc = prv_generic_discover;
    genericObj->writeFunc    = prv_generic_write;
    genericObj->executeFunc  = prv_generic_execute;
    genericObj->createFunc   = prv_generic_create;
    genericObj->deleteFunc   = prv_generic_delete;

    return genericObj;
}

void free_object(lwm2m_object_t * objectP)
{
    if (NULL != objectP) {
        if (NULL != objectP->userData) {
            lwm2m_free(objectP->userData);
        }
        if (NULL != objectP->instanceList) {
            lwm2m_list_free(objectP->instanceList);
        }
        lwm2m_free(objectP);
    }
}

void handle_value_changed(lwm2m_context_t * lwm2mH,
                          lwm2m_uri_t * uri,
                          const char * value,
                          size_t valueLength)
{
    // TODO rewrite entire code
    lwm2m_object_t * object = (lwm2m_object_t *)LWM2M_LIST_FIND(lwm2mH->objectList, uri->objectId);

    if (NULL != object)
    {
        if (object->writeFunc != NULL)
        {
            lwm2m_data_t * dataP;
            int result;

            dataP = lwm2m_data_new(1);
            if (dataP == NULL)
            {
                fprintf(stderr, "Internal allocation failure !\n");
                return;
            }
            dataP->id = uri->resourceId;
            lwm2m_data_encode_nstring(value, valueLength, dataP);

            result = object->writeFunc(uri->instanceId, 1, dataP, object);
            if (COAP_405_METHOD_NOT_ALLOWED == result)
            {
                switch (uri->objectId)
                {
                case LWM2M_DEVICE_OBJECT_ID:
                    result = device_change(dataP, object);
                    break;
                default:
                    break;
                }
            }

            if (COAP_204_CHANGED != result)
            {
                fprintf(stderr, "Failed to change value!\n");
            }
            else
            {
                fprintf(stderr, "value changed!\n");
                lwm2m_resource_value_changed(lwm2mH, uri);
            }
            lwm2m_data_free(1, dataP);
            return;
        }
        else
        {
            fprintf(stderr, "write not supported for specified resource!\n");
        }
        return;
    }
    else
    {
        fprintf(stderr, "Object not found !\n");
    }
}
